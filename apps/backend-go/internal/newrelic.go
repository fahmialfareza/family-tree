package app

import (
	"os"

	"github.com/newrelic/go-agent/v3/newrelic"
)

// InitNewRelic initializes the new relic app if NEW_RELIC_APP_NAME and NEW_RELIC_LICENSE_KEY are set
func InitNewRelic() (*newrelic.Application, error) {
	appName := os.Getenv("NEW_RELIC_APP_NAME")
	license := os.Getenv("NEW_RELIC_LICENSE_KEY")
	enabled := os.Getenv("NEW_RELIC_ENABLED")

	if license == "" || appName == "" {
		return nil, nil
	}
	if enabled == "false" {
		return nil, nil
	}

	app, err := newrelic.NewApplication(
		newrelic.ConfigAppName(appName),
		newrelic.ConfigLicense(license),
		newrelic.ConfigDistributedTracerEnabled(true),
	)
	if err != nil {
		return nil, err
	}
	return app, nil
}
