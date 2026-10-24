package app

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/newrelic/go-agent/v3/newrelic"
)

// Photo uploads. The content is sniffed (the client's Content-Type and filename are ignored) and only JPEG,
// PNG and WebP are accepted. Cloudinary stores them per tree, re-encoded through an incoming transformation
// that caps the size and drops EXIF/GPS metadata. Without CLOUDINARY_URL, development saves files to
// UPLOAD_DIR (served read-only at /uploads); production refuses uploads instead.

const maxPhotoBytes = 5 << 20

// photoTypes maps accepted sniffed content types to file extensions.
var photoTypes = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

// uploadError is a client-facing upload failure; other errors are logged and reported generically.
type uploadError struct {
	status  int
	message string
}

func (e *uploadError) Error() string { return e.message }

var (
	errPhotoTooLarge   = &uploadError{http.StatusRequestEntityTooLarge, "Photo must be 5 MB or smaller"}
	errPhotoType       = &uploadError{http.StatusBadRequest, "Photo must be a JPEG, PNG or WebP image"}
	errUploadsDisabled = &uploadError{http.StatusServiceUnavailable, "Photo uploads are not available"}
)

// uploadDir is where development uploads are stored and served from.
func uploadDir() string {
	if dir := os.Getenv("UPLOAD_DIR"); dir != "" {
		return dir
	}
	return "./tmp"
}

// localUploadsEnabled reports whether photos go to UPLOAD_DIR: development only, when Cloudinary is not configured.
func localUploadsEnabled() bool { return !IsProduction() && os.Getenv("CLOUDINARY_URL") == "" }

func uploadImage(c *gin.Context, field string) (string, error) {
	defer newrelic.FromContext(c.Request.Context()).StartSegment("upload/uploadImage").End()
	fileHeader, err := c.FormFile(field)
	if err != nil {
		return "", err
	}
	if fileHeader.Size > maxPhotoBytes {
		return "", errPhotoTooLarge
	}
	f, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer f.Close()

	head := make([]byte, 512)
	n, err := io.ReadFull(f, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return "", err
	}
	ext, ok := photoTypes[http.DetectContentType(head[:n])]
	if !ok {
		return "", errPhotoType
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return "", err
	}

	if os.Getenv("CLOUDINARY_URL") != "" {
		return uploadToCloudinary(c, f)
	}
	if !localUploadsEnabled() {
		slog.ErrorContext(c, "photo upload refused: CLOUDINARY_URL is not set in production", "request_id", requestID(c))
		return "", errUploadsDisabled
	}
	return saveLocally(f, ext)
}

// saveLocally writes the photo under a generated name (never the client's filename) in UPLOAD_DIR.
func saveLocally(src io.Reader, ext string) (string, error) {
	dir := uploadDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := uuid.Must(uuid.NewV7()).String() + ext
	dst, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(dst, io.LimitReader(src, maxPhotoBytes)); err != nil {
		dst.Close()
		return "", err
	}
	if err := dst.Close(); err != nil {
		return "", err
	}
	return "/uploads/" + name, nil
}

// cloudinaryFolder groups photos by tree when the request is tree-scoped.
func cloudinaryFolder(c *gin.Context) string {
	if a, ok := c.Get("access"); ok {
		if access, ok := a.(*treeAccess); ok && access.TreeID != "" {
			return "family-tree/trees/" + access.TreeID
		}
	}
	return "family-tree"
}

func uploadToCloudinary(c *gin.Context, f multipart.File) (string, error) {
	// Instrument this as an external segment to Cloudinary's API
	txn := newrelic.FromContext(c.Request.Context())
	seg := &newrelic.ExternalSegment{
		StartTime: txn.StartSegmentNow(),
		URL:       "https://api.cloudinary.com",
		Procedure: "Upload",
		Library:   "cloudinary-go",
	}
	defer seg.End()

	cld, err := cloudinary.NewFromURL(os.Getenv("CLOUDINARY_URL"))
	if err != nil {
		return "", fmt.Errorf("cloudinary client: %w", err)
	}
	no := false
	yes := true
	resp, err := cld.Upload.Upload(c, f, uploader.UploadParams{
		Folder:       cloudinaryFolder(c),
		ResourceType: "image",
		// Incoming transformation: the stored original is re-encoded, which strips EXIF/GPS and other
		// metadata, and is downscaled to fit 1600x1600 (never upscaled).
		Transformation:          "c_limit,w_1600,h_1600",
		AllowedFormats:          api.CldAPIArray{"jpg", "png", "webp"},
		DiscardOriginalFilename: &yes,
		UseFilename:             &no,
		ImageMetadata:           &no,
		Exif:                    &no,
		Overwrite:               &no,
	})
	if err != nil {
		return "", fmt.Errorf("cloudinary upload: %w", err)
	}
	if resp.Error.Message != "" {
		return "", fmt.Errorf("cloudinary upload: %s", resp.Error.Message)
	}
	if resp.SecureURL == "" {
		return "", errors.New("cloudinary upload: empty secure URL")
	}
	return resp.SecureURL, nil
}
