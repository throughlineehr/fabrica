package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// OAuthConfig holds Google OAuth credentials
type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
}

// GoogleUserInfo represents the user info from Google's API
type GoogleUserInfo struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Picture       string `json:"picture"`
}

// Session constants
const (
	SessionCookieName = "fabrica_session"
	SessionDuration   = 7 * 24 * time.Hour // 7 days
)

var oauthConfig *OAuthConfig

// InitOAuth loads OAuth credentials from environment
func InitOAuth(baseURL string) error {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")

	if clientID == "" || clientSecret == "" {
		log.Printf("OAuth disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set")
		return nil
	}

	oauthConfig = &OAuthConfig{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURI:  baseURL + "/oauth/google/callback",
	}

	log.Printf("OAuth enabled with redirect URI: %s", oauthConfig.RedirectURI)
	return nil
}

// IsOAuthEnabled returns true if OAuth is configured
func IsOAuthEnabled() bool {
	return oauthConfig != nil
}

// HandleGoogleAuth redirects to Google's OAuth consent screen
func HandleGoogleAuth(w http.ResponseWriter, r *http.Request) {
	if !IsOAuthEnabled() {
		http.Error(w, `{"error":"OAuth not configured"}`, http.StatusServiceUnavailable)
		return
	}

	// Generate state token for CSRF protection
	state := generateStateToken()
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   600, // 10 minutes
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})

	// Build Google OAuth URL
	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + url.Values{
		"client_id":     {oauthConfig.ClientID},
		"redirect_uri":  {oauthConfig.RedirectURI},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"state":         {state},
		"access_type":   {"offline"},
		"prompt":        {"consent"},
	}.Encode()

	http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
}

// HandleGoogleCallback processes the OAuth callback from Google
func HandleGoogleCallback(hub *Hub, w http.ResponseWriter, r *http.Request) {
	if !IsOAuthEnabled() {
		http.Error(w, `{"error":"OAuth not configured"}`, http.StatusServiceUnavailable)
		return
	}

	// Verify state token
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "Invalid state token", http.StatusBadRequest)
		return
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	// Check for OAuth error
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		log.Printf("OAuth error: %s", errParam)
		http.Redirect(w, r, "/login?error="+url.QueryEscape(errParam), http.StatusTemporaryRedirect)
		return
	}

	// Get authorization code
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Missing authorization code", http.StatusBadRequest)
		return
	}

	// Exchange code for tokens
	tokens, err := exchangeCodeForTokens(code)
	if err != nil {
		log.Printf("Token exchange failed: %v", err)
		http.Redirect(w, r, "/login?error=token_exchange_failed", http.StatusTemporaryRedirect)
		return
	}

	// Get user info from Google
	userInfo, err := getGoogleUserInfo(tokens.AccessToken)
	if err != nil {
		log.Printf("Failed to get user info: %v", err)
		http.Redirect(w, r, "/login?error=user_info_failed", http.StatusTemporaryRedirect)
		return
	}

	if hub.db == nil {
		http.Error(w, `{"error":"database required"}`, http.StatusServiceUnavailable)
		return
	}

	// Find existing user (must be invited first)
	user, err := findOrCreateGoogleUser(hub.db, userInfo)
	if err != nil {
		log.Printf("OAuth login rejected: %v", err)
		http.Redirect(w, r, "/login?error=no_account", http.StatusTemporaryRedirect)
		return
	}

	// Create session
	session, err := hub.db.CreateSession(user.ID)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		http.Redirect(w, r, "/login?error=session_failed", http.StatusTemporaryRedirect)
		return
	}

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    session.Token,
		Path:     "/",
		MaxAge:   int(SessionDuration.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})

	log.Printf("User %s logged in via Google OAuth", user.Email)

	// Redirect to app
	http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
}

// HandleLogout clears the session and redirects to login
func HandleLogout(hub *Hub, w http.ResponseWriter, r *http.Request) {
	// Get session cookie
	cookie, err := r.Cookie(SessionCookieName)
	if err == nil && cookie.Value != "" && hub.db != nil {
		// Delete session from database
		hub.db.DeleteSession(cookie.Value)
	}

	// Clear session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	http.Redirect(w, r, "/login", http.StatusTemporaryRedirect)
}

// HandleMe returns the current user's info
func HandleMe(hub *Hub, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Get session cookie
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil || cookie.Value == "" {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"authenticated":false}`))
		return
	}

	if hub.db == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"error":"database required"}`))
		return
	}

	// Validate session
	session, err := hub.db.GetSession(cookie.Value)
	if err != nil || session == nil {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"authenticated":false}`))
		return
	}

	// Get user
	user, err := hub.db.GetUserByID(session.UserID)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"authenticated":false}`))
		return
	}

	// Get user's rooms
	rooms, err := hub.db.GetUserRooms(user.ID)
	if err != nil {
		rooms = []string{}
	}

	json.NewEncoder(w).Encode(map[string]any{
		"authenticated": true,
		"user": map[string]any{
			"id":          user.ID,
			"email":       user.Email,
			"role":        user.Role,
			"scopeNodeId": user.ScopeNodeID,
			"rooms":       rooms,
		},
	})
}

// GetUserFromSession extracts user from session cookie
func GetUserFromSession(hub *Hub, r *http.Request) (*User, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil, fmt.Errorf("no session cookie")
	}

	if hub.db == nil {
		return nil, fmt.Errorf("database required")
	}

	session, err := hub.db.GetSession(cookie.Value)
	if err != nil || session == nil {
		return nil, fmt.Errorf("invalid session")
	}

	return hub.db.GetUserByID(session.UserID)
}

// --- Token exchange ---

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

func exchangeCodeForTokens(code string) (*TokenResponse, error) {
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"code":          {code},
		"client_id":     {oauthConfig.ClientID},
		"client_secret": {oauthConfig.ClientSecret},
		"redirect_uri":  {oauthConfig.RedirectURI},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token request failed: %s", string(body))
	}

	var tokens TokenResponse
	if err := json.Unmarshal(body, &tokens); err != nil {
		return nil, fmt.Errorf("parse tokens: %w", err)
	}

	return &tokens, nil
}

func getGoogleUserInfo(accessToken string) (*GoogleUserInfo, error) {
	req, err := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("userinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo request failed: %s", string(body))
	}

	var userInfo GoogleUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		return nil, fmt.Errorf("parse userinfo: %w", err)
	}

	return &userInfo, nil
}

// findOrCreateGoogleUser finds an existing user by Google ID or email
// Users must be invited first — OAuth does not create new accounts
func findOrCreateGoogleUser(db *DB, info *GoogleUserInfo) (*User, error) {
	// First, try to find by Google ID
	user, err := db.GetUserByGoogleID(info.ID)
	if err == nil && user != nil {
		return user, nil
	}

	// Try to find by email and link Google ID
	user, err = db.GetUserByEmail(info.Email)
	if err == nil && user != nil {
		// Link Google ID to existing user
		if err := db.SetUserGoogleID(user.ID, info.ID); err != nil {
			log.Printf("Failed to link Google ID to user %s: %v", user.ID, err)
		}
		return user, nil
	}

	// No account found — user must be invited first
	return nil, fmt.Errorf("no account found for %s — request an invite", info.Email)
}

func generateStateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// GetBaseURL determines the base URL from the request
func GetBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	// Check X-Forwarded headers for reverse proxy
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	}
	host := r.Host
	if fwdHost := r.Header.Get("X-Forwarded-Host"); fwdHost != "" {
		host = fwdHost
	}
	return scheme + "://" + strings.TrimSuffix(host, "/")
}

// HandleLogin handles email/password login for CLI clients
func HandleLogin(hub *Hub, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		w.Write([]byte(`{"error":"method not allowed"}`))
		return
	}

	if hub.db == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"error":"database required"}`))
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid request"}`))
		return
	}

	if err := json.Unmarshal(body, &req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid JSON"}`))
		return
	}

	if req.Email == "" || req.Password == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"email and password required"}`))
		return
	}

	// Check password
	user, err := hub.db.CheckUserPassword(req.Email, req.Password)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Create session
	session, err := hub.db.CreateSession(user.ID)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"session creation failed"}`))
		return
	}

	// Get user's rooms
	rooms, _ := hub.db.GetUserRooms(user.ID)

	log.Printf("User %s logged in via password", user.Email)

	json.NewEncoder(w).Encode(map[string]any{
		"token": session.Token,
		"user": map[string]any{
			"id":    user.ID,
			"email": user.Email,
			"role":  user.Role,
			"rooms": rooms,
		},
	})
}

// HandleRegister handles new user registration for CLI clients
// Note: Registration is typically invite-only, this is for self-registration if enabled
func HandleRegister(hub *Hub, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		w.Write([]byte(`{"error":"method not allowed"}`))
		return
	}

	if hub.db == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"error":"database required"}`))
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid request"}`))
		return
	}

	if err := json.Unmarshal(body, &req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid JSON"}`))
		return
	}

	if req.Email == "" || req.Password == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"email and password required"}`))
		return
	}

	// Check if user already exists
	existing, _ := hub.db.GetUserByEmail(req.Email)
	if existing != nil {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"error":"account already exists"}`))
		return
	}

	// Create user with password
	user, err := hub.db.CreateUserWithPassword(DefaultOrgID, req.Email, req.Password, "user", nil)
	if err != nil {
		log.Printf("Failed to create user: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"registration failed"}`))
		return
	}

	// Create session
	session, err := hub.db.CreateSession(user.ID)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"session creation failed"}`))
		return
	}

	log.Printf("User %s registered", user.Email)

	json.NewEncoder(w).Encode(map[string]any{
		"token": session.Token,
		"user": map[string]any{
			"id":    user.ID,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}
