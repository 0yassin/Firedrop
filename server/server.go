package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/google/uuid"
)

type Client struct {
	ID   string
	Name string
	typ  string
	ip   string
	Conn *websocket.Conn
	mu   sync.Mutex
}

type Settings struct {
	Name string `json:"name"`
}

type WsMsg struct {
	Event      string    `json:"event"`
	TargetID   string    `json:"target_id,omitempty"`
	TransferID string    `json:"transfer_id,omitempty"`
	Filename   string    `json:"filename,omitempty"`
	Filetype   string    `json:"filetype,omitempty"`
	Preview    string    `json:"preview,omitempty"`
	Filesize   int64     `json:"filesize,omitempty"`
	Name       string    `json:"name,omitempty"`
	Settings   *Settings `json:"settings,omitempty"`
}

type Transfer struct {
	SenderID   string
	ReceiverID string
	Filename   string
	TransferID string
	Writer     *io.PipeWriter
	Age        time.Time
	Filesize   int64
}

var transfers = make(map[string]*Transfer)
var transfersMu sync.RWMutex

var clients = make(map[string]*Client)
var clientsMu sync.RWMutex

//go:embed all:dist
var distFS embed.FS

func main() {
	port := "3000"
	fmt.Printf("App running at http://%s:%s\n", getaddr(), port)

	app := fiber.New(fiber.Config{
		StreamRequestBody: true,
	})
	app.Use(cors.New())

	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			transfersMu.Lock()
			for transferid, transfer := range transfers {
				if time.Since(transfer.Age) > 5*time.Minute {
					if transfer.Writer != nil {
						transfer.Writer.CloseWithError(fmt.Errorf("transfer timed out"))
					}
					delete(transfers, transferid)
				}
			}
			transfersMu.Unlock()
		}
	}()

	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		var id string = uuid.New().String()
		defaultName := fmt.Sprintf("device-%d", len(clients)+1)

		name := strings.TrimSpace(c.Query("name"))
		if name == "" {
			name = defaultName
		}

		clientsMu.Lock()
		clients[id] = &Client{
			ID:   id,
			Name: name,
			Conn: c,
			typ:  c.Query("type", "unknown"),
			ip:   c.IP(),
		}
		clientsMu.Unlock()

		clients[id].WriteJSON(fiber.Map{
			"event": "welcome",
			"id":    id,
		})
		broadcastdevices()
		fmt.Printf("Device connected: %s (ID: %s)\n", name, id)

		for {
			msgType, msg, err := c.ReadMessage()

			if err != nil {
				transfersMu.Lock()
				for transferid, transfer := range transfers {
					if transfer.SenderID == id {
						clientsMu.RLock()
						client, exists := clients[transfer.ReceiverID]
						clientsMu.RUnlock()
						if exists {
							client.WriteJSON(fiber.Map{
								"event":       "transfer_canceled",
								"transfer_id": transferid,
							})
						}
						if transfer.Writer != nil {
							transfer.Writer.CloseWithError(fmt.Errorf("sender disconnected"))
						}
						delete(transfers, transferid)
					}

					if transfer.ReceiverID == id {
						clientsMu.RLock()
						client, exists := clients[transfer.SenderID]
						clientsMu.RUnlock()
						if exists {
							client.WriteJSON(fiber.Map{
								"event":       "transfer_canceled",
								"transfer_id": transferid,
							})
						}
						if transfer.Writer != nil {
							transfer.Writer.CloseWithError(fmt.Errorf("receiver disconnected"))
						}
						delete(transfers, transferid)
					}
				}
				transfersMu.Unlock()

				clientsMu.Lock()
				delete(clients, id)
				clientsMu.Unlock()

				broadcastdevices()
				fmt.Printf("Device disconnected: %s (ID: %s)\n", name, id)
				break
			}

			if msgType == websocket.TextMessage {
				var message WsMsg
				if err := json.Unmarshal(msg, &message); err != nil {
					fmt.Println("Invalid JSON received:", err)
					continue
				}

				switch message.Event {
				case "upload_request":
					transfersMu.Lock()
					transfers[message.TransferID] = &Transfer{
						SenderID:   id,
						ReceiverID: message.TargetID,
						Filename:   message.Filename,
						TransferID: message.TransferID,
						Age:        time.Now(),
						Filesize:   message.Filesize,
					}
					transfersMu.Unlock()

					clientsMu.RLock()
					target, exists := clients[message.TargetID]
					senderName := clients[id].Name
					clientsMu.RUnlock()

					if exists {
						target.WriteJSON(fiber.Map{
							"event":       "incoming_transfer",
							"transfer_id": message.TransferID,
							"filename":    message.Filename,
							"senderName":  senderName,
							"filetype":    message.Filetype,
							"preview":     message.Preview,
							"status":      "waiting",
							"filesize":    message.Filesize,
						})
						fmt.Printf("Transfer request from %s to %s for file: %s\n", senderName, target.Name, message.Filename)
					}

				case "transfer_rejected":
					transfersMu.Lock()
					transfer, exists := transfers[message.TransferID]
					if exists {
						delete(transfers, message.TransferID)
					}
					transfersMu.Unlock()

					if !exists {
						break
					}

					clientsMu.RLock()
					senderConn, ok := clients[transfer.SenderID]
					clientsMu.RUnlock()

					if ok {
						senderConn.WriteJSON(fiber.Map{
							"event":       "transfer_rejected",
							"transfer_id": transfer.TransferID,
						})
					}

				case "transfer_canceled":
					transfersMu.Lock()
					transfer, exists := transfers[message.TransferID]
					if exists {
						if transfer.Writer != nil {
							transfer.Writer.Close()
						}
						delete(transfers, message.TransferID)
					}
					transfersMu.Unlock()

					if !exists {
						break
					}

					clientsMu.RLock()
					targetConn, ok := clients[transfer.ReceiverID]
					clientsMu.RUnlock()

					if ok {
						targetConn.WriteJSON(fiber.Map{
							"event":       "transfer_canceled",
							"transfer_id": transfer.TransferID,
						})
					}

				case "settings_update", "update_settings":
					newName := strings.TrimSpace(message.Name)
					if newName == "" && message.Settings != nil {
						newName = strings.TrimSpace(message.Settings.Name)
					}

					if newName != "" {
						clientsMu.Lock()
						if client, exists := clients[id]; exists {
							client.Name = newName
							fmt.Printf("Device %s renamed to: %s\n", id, newName)
						}
						clientsMu.Unlock()
						broadcastdevices()
					}
				}
			}
		}
	}))

	app.Post("/stream/:transferID", func(c fiber.Ctx) error {
		transferid := c.Params("transferID")
		transfersMu.Lock()
		transfer, exists := transfers[transferid]
		transfersMu.Unlock()

		if !exists || transfer.Writer == nil {
			return fiber.NewError(fiber.StatusNotFound, "Receiver not ready")
		}

		defer transfer.Writer.Close()
		bodystream := c.RequestCtx().RequestBodyStream()
		if bodystream == nil {
			return fiber.NewError(fiber.StatusBadRequest, "No body provided")
		}

		bytesWritten, err := io.Copy(transfer.Writer, bodystream)
		if err != nil {
			transfer.Writer.CloseWithError(err)
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to copy stream")
		}

		transfersMu.Lock()
		delete(transfers, transferid)
		transfersMu.Unlock()

		fmt.Printf("Streamed %d bytes for transfer %s\n", bytesWritten, transferid)
		return c.SendStatus(200)
	})

	app.Get("/download/:transferID", func(c fiber.Ctx) error {
		transferID := c.Params("transferID")

		transfersMu.Lock()
		transfer, exists := transfers[transferID]
		if !exists {
			transfersMu.Unlock()
			return fiber.NewError(fiber.StatusNotFound, "Transfer not found")
		}

		reader, writer := io.Pipe()
		transfer.Writer = writer
		transfersMu.Unlock()

		go func() {
			<-c.Context().Done()
			writer.CloseWithError(fmt.Errorf("receiver canceled download"))
		}()

		clientsMu.RLock()
		sender, senderExists := clients[transfer.SenderID]
		clientsMu.RUnlock()

		if senderExists {
			sender.WriteJSON(fiber.Map{
				"event":       "receiver_ready",
				"transfer_id": transferID,
			})
		}

		c.Set("Content-Disposition", "attachment; filename="+SanitizeFilename(transfer.Filename))
		if transfer.Filesize > 0 {
			c.Set("Content-Length", fmt.Sprintf("%d", transfer.Filesize))
		}

		return c.SendStream(reader)
	})

	serverRoot, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatal(err)
	}

	app.Use("/", static.New("", static.Config{
		FS:         serverRoot,
		IndexNames: []string{"index.html"},
	}))

	log.Fatal(app.Listen(":" + port))
}

func getaddr() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	return conn.LocalAddr().(*net.UDPAddr).IP.String()
}

func broadcastdevices() {
	clientsMu.RLock()
	defer clientsMu.RUnlock()

	var activeusers []fiber.Map
	for _, client := range clients {
		activeusers = append(activeusers, fiber.Map{
			"id":   client.ID,
			"name": client.Name,
			"type": client.typ,
			"ip":   client.ip,
		})
	}

	for _, client := range clients {
		client.WriteJSON(fiber.Map{
			"event": "devices_update",
			"users": activeusers,
		})
	}
}

func SanitizeFilename(input string) string {
	safeName := filepath.Base(input)
	if safeName == "." || safeName == string(filepath.Separator) {
		return "filename"
	}
	safeName = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, safeName)
	safeName = regexp.MustCompile(`[\\/:*?"<>|]`).ReplaceAllString(safeName, "_")

	safeName = strings.TrimSpace(safeName)
	if safeName == "" {
		return "filename"
	}
	if len(safeName) > 64 {
		safeName = safeName[:64]
	}
	return safeName
}

func (c *Client) WriteJSON(v interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteJSON(v)
}
