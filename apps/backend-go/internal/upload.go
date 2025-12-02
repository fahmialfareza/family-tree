package app

import (
	"fmt"
	"mime/multipart"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/gin-gonic/gin"
)

func uploadImage(c *gin.Context, field string) (string, error) {
	file, err := c.FormFile(field)
	if err != nil {
		fmt.Printf("[UPLOAD] Error getting form file '%s': %v\n", field, err)
		return "", err
	}
	// simple size check ~5MB
	if file.Size > 5*1024*1024 {
		fmt.Printf("[UPLOAD] File too large: %d bytes\n", file.Size)
		return "", fmt.Errorf("file too large")
	}

	fmt.Printf("[UPLOAD] Uploading file: %s, size: %d bytes\n", file.Filename, file.Size)

	// If CLOUDINARY_URL provided, use cloudinary upload
	cloudURL := os.Getenv("CLOUDINARY_URL")
	if cloudURL != "" {
		// validate URL
		if _, err := url.ParseRequestURI(cloudURL); err == nil {
			fmt.Printf("[UPLOAD] Using Cloudinary upload\n")
			return uploadToCloudinary(c, file)
		}
		fmt.Printf("[UPLOAD] Invalid CLOUDINARY_URL, falling back to local storage\n")
	} else {
		fmt.Printf("[UPLOAD] CLOUDINARY_URL not set, using local storage\n")
	}

	// fallback: save locally to ./tmp (or UPLOAD_DIR env)
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./tmp"
	}

	// Create upload directory if it doesn't exist
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		fmt.Printf("[UPLOAD] Error creating upload directory %s: %v\n", uploadDir, err)
		return "", err
	}

	dst := filepath.Join(uploadDir, fmt.Sprintf("upload-%d-%s", time.Now().UnixNano(), file.Filename))
	if err := c.SaveUploadedFile(file, dst); err != nil {
		fmt.Printf("[UPLOAD] Error saving file to %s: %v\n", dst, err)
		return "", err
	}
	fmt.Printf("[UPLOAD] File saved locally to %s\n", dst)
	return "/uploads/" + filepath.Base(dst), nil
}

func uploadToCloudinary(c *gin.Context, fileHeader *multipart.FileHeader) (string, error) {
	// create cloudinary client from env CLOUDINARY_URL
	cld, err := cloudinary.NewFromURL(os.Getenv("CLOUDINARY_URL"))
	if err != nil {
		fmt.Printf("[CLOUDINARY] Error creating client: %v\n", err)
		return "", err
	}
	f, err := fileHeader.Open()
	if err != nil {
		fmt.Printf("[CLOUDINARY] Error opening file: %v\n", err)
		return "", err
	}
	defer f.Close()
	// uploader takes io.Reader
	fmt.Printf("[CLOUDINARY] Uploading to Cloudinary folder: family-tree\n")
	resp, err := cld.Upload.Upload(c, f, uploader.UploadParams{Folder: "family-tree"})
	if err != nil {
		fmt.Printf("[CLOUDINARY] Upload error: %v\n", err)
		return "", err
	}
	if resp.SecureURL == "" {
		if resp.URL != "" {
			fmt.Printf("[CLOUDINARY] Using non-secure URL: %s\n", resp.URL)
			return resp.URL, nil
		}
		fmt.Printf("[CLOUDINARY] Empty URL from Cloudinary response\n")
		return "", fmt.Errorf("empty url from cloudinary")
	}
	fmt.Printf("[CLOUDINARY] Upload successful: %s\n", resp.SecureURL)
	return resp.SecureURL, nil
}
