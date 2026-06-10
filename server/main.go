package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/google/uuid"
)

var (
	port        = flag.Int("port", 8080, "Server port")
	webDir      = flag.String("web", "../web/dist", "Path to web static files")
	databaseURL = flag.String("database", "", "PostgreSQL connection URL (optional, enables persistence)")
)

func generateUUID() string {
	return uuid.New().String()
}

func main() {
	flag.Parse()

	var db *DB
	var saver *StateSaver
	var state *State

	// Connect to database if URL provided
	if *databaseURL != "" {
		log.Printf("Connecting to database...")
		var err error
		db, err = NewDB(*databaseURL)
		if err != nil {
			log.Fatalf("Database connection failed: %v", err)
		}
		defer db.Close()

		// Run migrations
		log.Printf("Running migrations...")
		if err := db.RunMigrations("migrations"); err != nil {
			log.Fatalf("Migrations failed: %v", err)
		}

		// Load state from database
		log.Printf("Loading state from database...")
		state, err = db.LoadState(DefaultOrgID)
		if err != nil {
			log.Fatalf("Load state failed: %v", err)
		}

		if state == nil {
			log.Printf("No existing state found, creating new state")
			state = NewState()
		} else {
			log.Printf("Loaded state: %d nodes, %d rooms with processors",
				len(state.Model.Entities), len(state.Processors))
		}

		// Create state saver
		saver = NewStateSaver(db, DefaultOrgID, state)
		saver.Start()
	} else {
		log.Printf("No database URL provided, running in-memory only")
		state = NewState()
	}

	hub := NewHub(state)
	hub.saver = saver // May be nil if no database
	hub.db = db       // May be nil if no database
	go hub.Run()

	// Create and start processor runtime
	runtime := NewRuntime(state, hub)
	hub.runtime = runtime
	runtime.Start()

	// Websocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	})

	// Health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Status endpoint
	http.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"clients":%d,"database":%t}`, hub.ClientCount(), db != nil)
	})

	// Invite info endpoint (GET /api/invite/{token})
	http.HandleFunc("/api/invite/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		if db == nil {
			http.Error(w, `{"error":"database required"}`, http.StatusServiceUnavailable)
			return
		}

		// Extract token from path: /api/invite/{token}
		token := strings.TrimPrefix(r.URL.Path, "/api/invite/")
		if token == "" {
			http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
			return
		}

		invite, err := db.GetInviteByToken(token)
		if err != nil {
			http.Error(w, `{"error":"invite not found","valid":false}`, http.StatusNotFound)
			return
		}

		// Check if already redeemed
		if invite.RedeemedAt != nil {
			http.Error(w, `{"error":"invite already used","valid":false}`, http.StatusGone)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"valid":   true,
			"rooms":   invite.Rooms,
			"orgName": "Fabrica", // TODO: Get from org table
		})
	})

	// Invite redemption endpoint (POST /api/redeem/{token})
	http.HandleFunc("/api/redeem/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		if db == nil {
			http.Error(w, `{"error":"database required"}`, http.StatusServiceUnavailable)
			return
		}

		// Extract token from path: /api/redeem/{token}
		token := strings.TrimPrefix(r.URL.Path, "/api/redeem/")
		if token == "" {
			http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
			return
		}

		// Parse request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}

		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" {
			http.Error(w, `{"error":"email and password required"}`, http.StatusBadRequest)
			return
		}

		// Get and validate invite
		invite, err := db.GetInviteByToken(token)
		if err != nil {
			http.Error(w, `{"error":"invite not found"}`, http.StatusNotFound)
			return
		}

		if invite.RedeemedAt != nil {
			http.Error(w, `{"error":"invite already used"}`, http.StatusGone)
			return
		}

		// Create user
		user, err := db.CreateUser(invite.OrgID, req.Email, "user", nil)
		if err != nil {
			log.Printf("Failed to create user: %v", err)
			http.Error(w, `{"error":"failed to create account"}`, http.StatusInternalServerError)
			return
		}

		// Assign rooms from invite
		for _, roomKey := range invite.Rooms {
			if err := db.AddUserToRoom(user.ID, roomKey); err != nil {
				log.Printf("Failed to assign room %s to user %s: %v", roomKey, user.ID, err)
			}
		}

		// Mark invite as redeemed
		if err := db.RedeemInvite(token, user.ID); err != nil {
			log.Printf("Failed to mark invite as redeemed: %v", err)
		}

		log.Printf("User %s registered via invite %s", req.Email, token)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"userId":  user.ID,
		})
	})

	// SPA routing - serve index.html for client-side routes
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Serve index.html for SPA routes
		if strings.HasPrefix(path, "/invite/") || path == "/download" {
			http.ServeFile(w, r, filepath.Join(*webDir, "index.html"))
			return
		}

		// Try to serve static file
		filePath := filepath.Join(*webDir, path)
		if _, err := os.Stat(filePath); err == nil {
			http.ServeFile(w, r, filePath)
			return
		}

		// Fallback to index.html for unknown routes (SPA)
		http.ServeFile(w, r, filepath.Join(*webDir, "index.html"))
	})

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Printf("Shutting down...")
		runtime.Stop()
		if saver != nil {
			saver.Stop()
		}
		os.Exit(0)
	}()

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Fabrica server starting on %s", addr)
	log.Printf("Serving web from %s", *webDir)
	if db != nil {
		log.Printf("Database persistence enabled")
	}
	log.Fatal(http.ListenAndServe(addr, nil))
}
