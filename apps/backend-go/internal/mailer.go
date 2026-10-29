package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
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
		slog.Warn("RESEND_API_KEY is not set; emails (with their links) are printed to the log instead of sent")
		mailer = consoleMailer{}
		return
	}
	from := os.Getenv("EMAIL_FROM")
	if from == "" {
		from = "Sakdulur <noreply@sakdulur.com>"
	}
	mailer = resendMailer{apiKey: key, from: from, client: &http.Client{Timeout: 10 * time.Second}}
}

type consoleMailer struct{}

func (consoleMailer) Send(_ context.Context, msg Email) error {
	// Development only (production requires RESEND_API_KEY): the link is needed to finish the flow locally.
	slog.Info("email (not sent)", "to", msg.To, "subject", msg.Subject, "text", msg.Text)
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

// linkMail is the content of a one-button email: a heading, a short message, the action link and a closing note.
type linkMail struct {
	Subject, Preheader string
	Eyebrow, Heading   string // small label above the heading, and the heading itself
	Intro              string
	Card               *mailCard // optional highlighted box, e.g. the tree someone was invited to
	Action, Link       string
	Outro              string
}

type mailCard struct{ Title, Detail string }

// mailChrome is the fixed text around every email, per language.
type mailChrome struct{ Lang, FallbackLink, Tagline, NoReply string }

var mailChromes = map[string]mailChrome{
	"en": {"en", "Button not working? Paste this link into your browser:",
		"Sakdulur keeps your family's story together, across every generation.",
		"This is an automated message; replies aren't monitored."},
	"id": {"id", "Tombol tidak berfungsi? Salin tautan ini ke browser Anda:",
		"Sakdulur menyatukan kisah keluarga Anda, lintas generasi.",
		"Ini adalah pesan otomatis; balasan tidak dipantau."},
}

// mailLang picks the email language: the recipient's saved language, else the language the sender is using
// on the site (X-Locale from the frontend, which follows the language switcher), else Accept-Language.
func mailLang(c *gin.Context, saved string) string {
	if saved == "en" || saved == "id" {
		return saved
	}
	if l := c.GetHeader("X-Locale"); l == "en" || l == "id" {
		return l
	}
	al := strings.ToLower(strings.TrimSpace(c.GetHeader("Accept-Language")))
	if strings.HasPrefix(al, "id") || strings.HasPrefix(al, "in") {
		return "id"
	}
	return "en"
}

func linkEmail(to, lang string, m linkMail) Email {
	intro := m.Intro
	if m.Card != nil {
		intro += fmt.Sprintf("\n\n%s (%s)", m.Card.Title, m.Card.Detail)
	}
	text := fmt.Sprintf("%s\n\n%s\n\n%s: %s\n\n%s\n\n— Sakdulur\n", m.Heading, intro, m.Action, m.Link, m.Outro)
	chrome, ok := mailChromes[lang]
	if !ok {
		chrome = mailChromes["en"]
	}
	var b strings.Builder
	if err := mailLayout.Execute(&b, struct {
		linkMail
		mailChrome
		BaseURL string
		Year    int
	}{m, chrome, appBaseURL, time.Now().Year()}); err != nil {
		slog.Error("email template failed", "subject", m.Subject, "error", err)
		return Email{To: to, Subject: m.Subject, Text: text}
	}
	return Email{To: to, Subject: m.Subject, Text: text, HTML: b.String()}
}

// mailLayout mirrors the web app's auth screens: sand background, white rounded card, Fraunces-style serif
// heading, forest-green primary button and a terracotta accent. Colors are the hex equivalents of the light
// tokens in apps/frontend/src/app/globals.css (plus a dark variant for clients that honor prefers-color-scheme).
// Table layout and inline styles keep it intact in Gmail and Outlook; html/template escapes every value.
var mailLayout = template.Must(template.New("email").Parse(`<!DOCTYPE html>
<html lang="{{.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{.Subject}}</title>
<style>
  body { margin: 0; padding: 0; }
  a { color: #296d40; }
  @media (max-width: 600px) {
    .shell { padding: 24px 12px !important; }
    .card { padding: 32px 22px !important; }
    .heading { font-size: 24px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background-color: #18130e !important; }
    .card { background-color: #221b16 !important; border-color: #3a322b !important; }
    .fg { color: #f2eee7 !important; }
    .muted { color: #b2a99d !important; }
    .box { background-color: #312a23 !important; border-color: #3a322b !important; }
    .btn { background-color: #6cc185 !important; }
    .btn a { color: #0b1a0f !important; }
    .link { color: #6cc185 !important; }
    .rule { border-color: #3a322b !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#f9f5ec;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{.Preheader}}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f5ec;">
<tr><td align="center" class="shell" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td align="center" style="padding:0 0 24px;">
      <a href="{{.BaseURL}}" style="text-decoration:none;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:10px;vertical-align:middle;"><img src="{{.BaseURL}}/email/logo.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:10px;"></td>
          <td class="fg" style="vertical-align:middle;font-family:Fraunces,Georgia,'Times New Roman',serif;font-size:21px;font-weight:600;letter-spacing:-0.01em;color:#291f18;">Sakdulur</td>
        </tr></table>
      </a>
    </td></tr>
    <tr><td class="card" style="background-color:#fffefc;border:1px solid #e1dacf;border-radius:16px;padding:40px 36px;box-shadow:0 2px 4px rgba(60,45,30,0.06),0 12px 32px rgba(60,45,30,0.08);font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#bf623d;text-align:center;">{{.Eyebrow}}</p>
      <h1 class="fg heading" style="margin:0 0 14px;font-family:Fraunces,Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:#291f18;text-align:center;">{{.Heading}}</h1>
      <p class="muted" style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#66584d;text-align:center;">{{.Intro}}</p>
      {{with .Card}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr>
        <td class="box" style="background-color:#f2eadd;border:1px solid #e1dacf;border-radius:12px;padding:18px 20px;text-align:center;">
          <p class="fg" style="margin:0;font-family:Fraunces,Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;color:#291f18;">{{.Title}}</p>
          <p class="muted" style="margin:4px 0 0;font-size:13px;color:#66584d;">{{.Detail}}</p>
        </td>
      </tr></table>{{end}}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr>
        <td class="btn" align="center" bgcolor="#296d40" style="border-radius:10px;background-color:#296d40;">
          <a href="{{.Link}}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;line-height:1;color:#f7fef8;text-decoration:none;border-radius:10px;">{{.Action}}</a>
        </td>
      </tr></table>
      <p class="muted" style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#66584d;text-align:center;">{{.Outro}}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;"><tr>
        <td class="rule" style="border-top:1px solid #e1dacf;padding-top:20px;">
          <p class="muted" style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#66584d;">{{.FallbackLink}}</p>
          <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a class="link" href="{{.Link}}" target="_blank" style="color:#296d40;text-decoration:underline;">{{.Link}}</a></p>
        </td>
      </tr></table>
    </td></tr>
    <tr><td align="center" style="padding:24px 16px 0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <p class="muted" style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#66584d;">{{.Tagline}}</p>
      <p class="muted" style="margin:0;font-size:12px;line-height:1.5;color:#66584d;">&copy; {{.Year}} <a class="link" href="{{.BaseURL}}" style="color:#296d40;text-decoration:none;font-weight:600;">Sakdulur</a> &middot; {{.NoReply}}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
`))

// sendMail delivers in the background so slow providers never block or reveal anything to the caller.
func sendMail(msg Email) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := mailer.Send(ctx, msg); err != nil {
			slog.Error("email delivery failed", "subject", msg.Subject, "error", err)
		}
	}()
}

func sendVerificationEmail(to, lang, token string) {
	m := linkMail{
		Subject:   "Verify your email for Sakdulur",
		Preheader: "One click to finish setting up your Sakdulur account.",
		Eyebrow:   "Welcome to Sakdulur",
		Heading:   "Confirm your email",
		Intro:     "Confirm this address to finish setting up your Sakdulur account and start building your family tree.",
		Action:    "Verify email",
		Outro:     "The link expires in 24 hours. If you did not create an account, you can safely ignore this email.",
	}
	if lang == "id" {
		m = linkMail{
			Subject:   "Verifikasi email Anda untuk Sakdulur",
			Preheader: "Satu klik lagi untuk menyelesaikan pendaftaran akun Sakdulur Anda.",
			Eyebrow:   "Selamat datang di Sakdulur",
			Heading:   "Konfirmasi email Anda",
			Intro:     "Konfirmasi alamat ini untuk menyelesaikan pendaftaran akun Sakdulur Anda dan mulai menyusun silsilah keluarga.",
			Action:    "Verifikasi email",
			Outro:     "Tautan ini berlaku selama 24 jam. Jika Anda tidak membuat akun, abaikan saja email ini.",
		}
	}
	m.Link = appLink("/auth/verify-email", map[string]string{"token": token})
	sendMail(linkEmail(to, lang, m))
}

func sendPasswordResetEmail(to, lang, token string) {
	m := linkMail{
		Subject:   "Reset your Sakdulur password",
		Preheader: "Use this link within the next hour to choose a new password.",
		Eyebrow:   "Password reset",
		Heading:   "Choose a new password",
		Intro:     "Someone asked to reset the password for your Sakdulur account. If it was you, pick a new one below.",
		Action:    "Reset password",
		Outro:     "The link expires in 1 hour. If this wasn't you, ignore this email; your password stays the same.",
	}
	if lang == "id" {
		m = linkMail{
			Subject:   "Atur ulang kata sandi Sakdulur Anda",
			Preheader: "Gunakan tautan ini dalam satu jam untuk membuat kata sandi baru.",
			Eyebrow:   "Atur ulang kata sandi",
			Heading:   "Buat kata sandi baru",
			Intro:     "Seseorang meminta pengaturan ulang kata sandi akun Sakdulur Anda. Jika itu Anda, buat kata sandi baru di bawah ini.",
			Action:    "Atur ulang kata sandi",
			Outro:     "Tautan ini berlaku selama 1 jam. Jika bukan Anda yang meminta, abaikan email ini; kata sandi Anda tidak berubah.",
		}
	}
	m.Link = appLink("/auth/reset-password", map[string]string{"token": token})
	sendMail(linkEmail(to, lang, m))
}

func sendInviteEmail(to, lang, inviter, treeName, token string) {
	m := linkMail{
		Subject:   fmt.Sprintf("%s invited you to the %s family tree", inviter, treeName),
		Preheader: fmt.Sprintf("Join %s on Sakdulur and help grow your family tree together.", inviter),
		Eyebrow:   "You're invited",
		Heading:   "Join your family tree",
		Intro:     fmt.Sprintf("%s invited you to view and help build this family tree on Sakdulur.", inviter),
		Card:      &mailCard{Title: treeName, Detail: "Invited by " + inviter},
		Action:    "Accept invitation",
		Outro:     "Sign in or create an account with this email address to accept. The invitation expires in 7 days.",
	}
	if lang == "id" {
		m = linkMail{
			Subject:   fmt.Sprintf("%s mengundang Anda bergabung ke “%s” di Sakdulur", inviter, treeName),
			Preheader: fmt.Sprintf("Bergabunglah dengan %s di Sakdulur dan susun silsilah keluarga bersama.", inviter),
			Eyebrow:   "Anda diundang",
			Heading:   "Bergabung ke silsilah keluarga",
			Intro:     fmt.Sprintf("%s mengundang Anda untuk melihat dan ikut menyusun silsilah keluarga ini di Sakdulur.", inviter),
			Card:      &mailCard{Title: treeName, Detail: "Diundang oleh " + inviter},
			Action:    "Terima undangan",
			Outro:     "Masuk atau buat akun dengan alamat email ini untuk menerima undangan. Undangan berlaku selama 7 hari.",
		}
	}
	m.Link = appLink("/invite", map[string]string{"token": token})
	sendMail(linkEmail(to, lang, m))
}
