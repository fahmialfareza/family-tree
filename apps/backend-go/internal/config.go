package app

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// IsProduction is true when APP_ENV=production. Production refuses to start with settings that silently
// weaken security (see CheckProductionConfig); other environments only log warnings.
func IsProduction() bool { return strings.EqualFold(os.Getenv("APP_ENV"), "production") }

// CheckProductionConfig lists required production settings that are missing.
func CheckProductionConfig() error {
	var missing []string
	if len(os.Getenv("JWT_SECRET")) < 32 {
		missing = append(missing, "JWT_SECRET (at least 32 characters)")
	}
	if os.Getenv("REDIS_URL") == "" {
		missing = append(missing, "REDIS_URL (rate limits are off without Redis)")
	}
	if os.Getenv("RESEND_API_KEY") == "" {
		missing = append(missing, "RESEND_API_KEY (emails would be written to the log)")
	}
	if os.Getenv("TRUSTED_PROXIES") == "" && os.Getenv("CLIENT_IP_HEADER") == "" {
		missing = append(missing, "TRUSTED_PROXIES or CLIENT_IP_HEADER (client IPs could be spoofed); use TRUSTED_PROXIES=none to use the peer address")
	}
	if len(os.Getenv("BFF_SHARED_SECRET")) < 32 {
		missing = append(missing, "BFF_SHARED_SECRET (at least 32 characters, same value in the frontend; lets the API see visitor IPs)")
	}
	if strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS")) == "" {
		missing = append(missing, "ALLOWED_ORIGINS (comma-separated frontend origins allowed by CORS)")
	} else if _, err := AllowedOrigins(); err != nil {
		missing = append(missing, err.Error())
	}
	for _, k := range []string{"APP_BASE_URL", "API_BASE_URL"} {
		if !strings.HasPrefix(os.Getenv(k), "https://") {
			missing = append(missing, k+" (https URL)")
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("APP_ENV=production but these settings are missing or unsafe:\n  - %s", strings.Join(missing, "\n  - "))
	}
	return nil
}

// defaultDevOrigin is the only CORS origin allowed outside production when ALLOWED_ORIGINS is unset.
const defaultDevOrigin = "http://localhost:3000"

// AllowedOrigins parses ALLOWED_ORIGINS: comma-separated exact origins such as https://app.example.com
// (scheme + host[:port], no path). Unset means http://localhost:3000 outside production.
func AllowedOrigins() ([]string, error) {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if raw == "" {
		if IsProduction() {
			return nil, fmt.Errorf("ALLOWED_ORIGINS is required with APP_ENV=production")
		}
		return []string{defaultDevOrigin}, nil
	}
	var origins []string
	for _, o := range strings.Split(raw, ",") {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		if o == "" {
			continue
		}
		u, err := url.Parse(o)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.User != nil {
			return nil, fmt.Errorf("ALLOWED_ORIGINS: %q is not an origin like https://app.example.com", o)
		}
		origins = append(origins, u.Scheme+"://"+strings.ToLower(u.Host))
	}
	if len(origins) == 0 {
		return nil, fmt.Errorf("ALLOWED_ORIGINS has no origins")
	}
	return origins, nil
}

// envInt reads a positive integer setting, falling back to def when unset. Invalid values are an error.
func envInt(key string, def int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return n, nil
}
