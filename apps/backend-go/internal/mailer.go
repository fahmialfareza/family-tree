package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Email is a transactional message with a plain-text and an HTML body.
type Email struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Mailer sends transactional email. Resend in production; console output when no API key is set.
type Mailer interface {
	Send(ctx context.Context, msg Email) error
}

var (
	mailer     Mailer = consoleMailer{}
	appBaseURL        = "http://localhost:3000"
)

// InitMailer reads RESEND_API_KEY, EMAIL_FROM and APP_BASE_URL (the frontend origin used in links).
func InitMailer() {
	if v := strings.TrimRight(os.Getenv("APP_BASE_URL"), "/"); v != "" {
		appBaseURL = v
	}
	key := os.Getenv("RESEND_API_KEY")
	if key == "" {
		log.Println("warning: RESEND_API_KEY is not set; emails (with their links) are printed to the log instead of sent")
		mailer = consoleMailer{}
		return
	}
	from := os.Getenv("EMAIL_FROM")
	if from == "" {
		from = "Family Tree <noreply@family-tree.app>"
	}
	mailer = resendMailer{apiKey: key, from: from, client: &http.Client{Timeout: 10 * time.Second}}
}

type consoleMailer struct{}

func (consoleMailer) Send(_ context.Context, msg Email) error {
	log.Printf("[email] to=%s subject=%q\n%s", msg.To, msg.Subject, msg.Text)
	return nil
}

type resendMailer struct {
	apiKey, from string
	client       *http.Client
}

func (m resendMailer) Send(ctx context.Context, msg Email) error {
	body, _ := json.Marshal(map[string]any{
		"from": m.from, "to": []string{msg.To}, "subject": msg.Subject, "text": msg.Text, "html": msg.HTML,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.apiKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("resend: status %d", res.StatusCode)
	}
	return nil
}

// appLink builds a frontend URL such as /auth/verify-email?token=...
func appLink(path string, params map[string]string) string {
	q := url.Values{}
	for k, v := range params {
		q.Set(k, v)
	}
	return appBaseURL + path + "?" + q.Encode()
}

func linkEmail(to, subject, intro, action, link, outro string) Email {
	text := fmt.Sprintf("%s\n\n%s: %s\n\n%s\n", intro, action, link, outro)
	h := fmt.Sprintf(`<p>%s</p><p><a href="%s">%s</a></p><p style="color:#666">%s</p>`,
		html.EscapeString(intro), html.EscapeString(link), html.EscapeString(action), html.EscapeString(outro))
	return Email{To: to, Subject: subject, Text: text, HTML: h}
}

// sendMail delivers in the background so slow providers never block or reveal anything to the caller.
func sendMail(msg Email) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := mailer.Send(ctx, msg); err != nil {
			log.Printf("email to %s failed: %v", msg.To, err)
		}
	}()
}

func sendVerificationEmail(to, token string) {
	sendMail(linkEmail(to, "Verify your email for Family Tree",
		"Confirm this address to finish setting up your Family Tree account.",
		"Verify email", appLink("/auth/verify-email", map[string]string{"token": token}),
		"The link expires in 24 hours. If you did not create an account, ignore this email."))
}

func sendPasswordResetEmail(to, token string) {
	sendMail(linkEmail(to, "Reset your Family Tree password",
		"Someone asked to reset the password for your Family Tree account.",
		"Choose a new password", appLink("/auth/reset-password", map[string]string{"token": token}),
		"The link expires in 1 hour. If this wasn't you, ignore this email; your password stays the same."))
}

func sendInviteEmail(to, inviter, treeName, token string) {
	sendMail(linkEmail(to, fmt.Sprintf("%s invited you to the %s family tree", inviter, treeName),
		fmt.Sprintf("%s invited you to join \"%s\" on Family Tree.", inviter, treeName),
		"Accept invitation", appLink("/invite", map[string]string{"token": token}),
		"Sign in or create an account with this email address to accept. The invitation expires in 7 days."))
}
