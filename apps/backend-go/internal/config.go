package app

import (
	"fmt"
	"os"
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
