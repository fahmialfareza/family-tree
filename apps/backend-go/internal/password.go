package app

import (
	"strings"
	"sync"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	minPasswordLength = 10
	maxPasswordBytes  = 72 // bcrypt ignores everything past 72 bytes
)

// bcryptCost is a variable so tests can use bcrypt.MinCost.
var bcryptCost = 12

// dummyHash is compared against when a login names an unknown or password-less account, so every path
// takes the same bcrypt time. It is built at bcryptCost; older hashes are upgraded on login (needsRehash).
var (
	dummyOnce sync.Once
	dummyHash []byte
)

func dummyPasswordHash() []byte {
	dummyOnce.Do(func() {
		dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy password for timing"), bcryptCost)
	})
	return dummyHash
}

// needsRehash reports whether a valid hash was made with a lower cost than bcryptCost
// (accounts from the Node.js backend used cost 10).
func needsRehash(hash string) bool {
	cost, err := bcrypt.Cost([]byte(hash))
	return err == nil && cost < bcryptCost
}

// commonPasswords rejects the most frequently breached passwords that pass the length rule.
var commonPasswords = map[string]struct{}{
	"1234567890": {}, "12345678910": {}, "0123456789": {}, "1111111111": {}, "0000000000": {},
	"qwertyuiop": {}, "1q2w3e4r5t": {}, "password12": {}, "password123": {}, "password1234": {},
	"passw0rd123": {}, "iloveyou12": {}, "qwerty1234": {}, "qwerty12345": {}, "abcdefghij": {},
	"abc1234567": {}, "letmein123": {}, "welcome123": {}, "admin12345": {}, "administrator": {},
	"football12": {}, "baseball12": {}, "superman12": {}, "princess12": {}, "sunshine12": {},
	"1qaz2wsx3edc": {}, "zaq12wsx": {}, "asdfghjkl1": {}, "asdfghjkl;": {}, "987654321": {},
	"9876543210": {}, "11223344556": {}, "1122334455": {}, "aaaaaaaaaa": {}, "changeme12": {},
	"familytree": {}, "familytree1": {}, "familytree123": {}, "keluarga123": {}, "bismillah123": {},
	"indonesia123": {}, "jakarta123": {}, "rahasia123": {}, "sayang12345": {}, "katasandi123": {},
}

// validatePassword returns a user-facing message, or "" when the password is acceptable.
// personal holds values the password must not equal (email, username, name).
func validatePassword(password string, personal ...string) string {
	if utf8.RuneCountInString(password) < minPasswordLength {
		return "Password must be at least 10 characters"
	}
	if len(password) > maxPasswordBytes {
		return "Password must be at most 72 bytes"
	}
	lower := strings.ToLower(password)
	if _, ok := commonPasswords[lower]; ok {
		return "This password is too common; choose another"
	}
	for _, p := range personal {
		p = strings.ToLower(strings.TrimSpace(p))
		if p != "" && (lower == p || (strings.Contains(p, "@") && lower == strings.SplitN(p, "@", 2)[0])) {
			return "Password must not match your name, username or email"
		}
	}
	return ""
}

func hashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(h), err
}

// checkPassword compares in constant time relative to the hash; an empty hash (no password set,
// e.g. Google-only accounts, or unknown users) still spends bcrypt time and always fails.
func checkPassword(hash, password string) bool {
	if hash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyPasswordHash(), []byte(password))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
