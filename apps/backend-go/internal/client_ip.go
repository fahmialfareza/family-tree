package app

import (
	"crypto/subtle"
	"net"
	"os"

	"github.com/gin-gonic/gin"
)

// The browser reaches this API through the frontend's server (BFF), so the TCP peer is the frontend, not
// the visitor. The frontend forwards the visitor's IP in X-Client-IP together with BFF_SHARED_SECRET; only
// when the secret matches is that IP used for rate limits and session records. Without the secret header
// the request is treated like any other (normal client-IP rules apply), so a spoofed X-Client-IP is ignored.

const (
	bffSecretHeader = "X-BFF-Secret"
	clientIPHeader  = "X-Client-IP"
)

// BFFClientIPMiddleware must run before anything that calls c.ClientIP().
func BFFClientIPMiddleware() gin.HandlerFunc {
	secret := []byte(os.Getenv("BFF_SHARED_SECRET"))
	return func(c *gin.Context) {
		if len(secret) == 0 {
			c.Next()
			return
		}
		presented := []byte(c.GetHeader(bffSecretHeader))
		if len(presented) > 0 && subtle.ConstantTimeCompare(presented, secret) == 1 {
			if ip := net.ParseIP(c.GetHeader(clientIPHeader)); ip != nil {
				c.Set(bffClientIPKey, ip.String())
			}
		}
		c.Request.Header.Del(bffSecretHeader)
		c.Next()
	}
}

const bffClientIPKey = "bffClientIP"

// clientIP is c.ClientIP() unless a verified BFF request named the visitor's IP.
func clientIP(c *gin.Context) string {
	if ip := c.GetString(bffClientIPKey); ip != "" {
		return ip
	}
	return c.ClientIP()
}
