package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func responseSuccess(c *gin.Context, data interface{}, statusCode ...int) {
	code := http.StatusOK
	if len(statusCode) > 0 {
		code = statusCode[0]
	}
	c.JSON(code, gin.H{"status": code, "data": data})
}

func responseError(c *gin.Context, message string, status int) {
	if status == 0 {
		status = http.StatusInternalServerError
	}
	c.JSON(status, gin.H{"message": message, "status": status})
}
