package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
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

	// Serve static files (the React app)
	fs := http.FileServer(http.Dir(*webDir))
	http.Handle("/", fs)

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
