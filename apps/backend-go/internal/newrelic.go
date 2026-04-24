package app

import (
	"os"

	"github.com/newrelic/go-agent/v3/newrelic"
)

// NRApp is the global New Relic application instance. It is set by InitNewRelic and used
// by database/external-service instrumentation hooks throughout the application.
var NRApp *newrelic.Application

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
	NRApp = app
	return app, nil
}
