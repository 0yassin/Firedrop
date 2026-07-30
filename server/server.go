package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"sync"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/google/uuid"
)

type Client struct {
	ID   string
	Name string
	typ  string
	ip   string
	Conn *websocket.Conn
}

type WsMsg struct {
	Event      string `json:"event"`
	TargetID   string `json:"target_id"`
	TransferID string `json:"transfer_id"`
	Filename   string `json:"filename"`
	Filetype   string `json:"filetype"`
	Preview    string `json:"preview"`
}

type Transfer struct {
	SenderID   string
	ReceiverID string
	Filename   string
	TransferID string
	Writer     *io.PipeWriter
}

var transfers = make(map[string]*Transfer)
var transfersMu sync.RWMutex

var clients = make(map[string]*Client)
var clientsMu sync.RWMutex

func main() {
	fmt.Printf(getaddr())
	port := "3000"
	app := fiber.New(fiber.Config{
		StreamRequestBody: true,
	})
	app.Use(cors.New())

	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		var id string = uuid.New().String()
		defaultName := fmt.Sprintf("device-%d", len(clients))

		clientsMu.Lock()
		clients[id] = &Client{
			ID:   id,
			Name: c.Query("name", defaultName),
			Conn: c,
			typ:  c.Query("type", "unknown"),
			ip:   c.IP(),
		}

		clientsMu.Unlock()
		c.WriteJSON(fiber.Map{
			"event": "welcome",
			"id":    id,
		})
		broadcastdevices()
		fmt.Printf("A new device just connected, ID: %s \n", id)

		for {
			msgType, msg, err := c.ReadMessage()

			if err != nil {
				clientsMu.Lock()
				delete(clients, id)
				clientsMu.Unlock()
				broadcastdevices()
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
					}
					transfersMu.Unlock()

					clientsMu.RLock()
					target, exists := clients[message.TargetID]
					if exists {
						target.Conn.WriteJSON(fiber.Map{
							"event":       "incoming_transfer",
							"transfer_id": message.TransferID,
							"filename":    message.Filename,
							"senderName":  clients[id].Name,
							"filetype":    message.Filetype,
							"preview":     message.Preview,
						})
						fmt.Printf("Alerted %s about transfer %s\n", target.Name, message.TransferID)
					}
					clientsMu.RUnlock()

				case "transfer_rejected":
					transfersMu.Lock()
					transfer, exists := transfers[message.TransferID]
					transfersMu.Unlock()
					if !exists {
						break
					}
					clientsMu.Lock()
					senderConn, ok := clients[transfer.SenderID]
					clientsMu.Unlock()
					if ok {
						senderConn.Conn.WriteJSON(WsMsg{
							Event:      "transfer_rejected",
							TransferID: transfer.TransferID,
						})
					}
					transfersMu.Lock()
					delete(transfers, message.TransferID)
					transfersMu.Unlock()

				}
			}
		}
	}))

	app.Get("/", func(c fiber.Ctx) error {
		return c.SendFile("dist/main.html")
	})

	app.Post("/stream/:transferID", func(c fiber.Ctx) error {
		transferid := c.Params("transferID")
		fmt.Printf("[DEBUG] 4. Sender hit POST /stream for transfer: %s\n", transferid)
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
		transfer.Writer.Close()
		transfersMu.Lock()
		delete(transfers, transferid)
		transfersMu.Unlock()
		if err != nil {
			fmt.Println("[DEBUG] Failed to copy stream", err)
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to copy stream")
		}
		fmt.Printf("streamed %d \n", bytesWritten)
		return c.SendStatus(200)
	})

	app.Get("/download/:transferID", func(c fiber.Ctx) error {
		transferID := c.Params("transferID")
		fmt.Printf("[DEBUG] 1. Receiver requested download for transfer: %s\n", transferID)

		transfersMu.Lock()
		transfer, exists := transfers[transferID]
		if !exists {
			transfersMu.Unlock()
			fmt.Println("[DEBUG] ERROR: Transfer not found during download")
			return fiber.NewError(fiber.StatusNotFound, "Transfer not found")
		}

		reader, writer := io.Pipe()
		transfer.Writer = writer
		transfersMu.Unlock()

		clientsMu.RLock()
		sender, senderExists := clients[transfer.SenderID]
		clientsMu.RUnlock()

		if senderExists {
			fmt.Printf("[DEBUG] 2. Alerting Sender (%s) that Receiver is ready\n", sender.Name)
			sender.Conn.WriteJSON(fiber.Map{
				"event":       "receiver_ready",
				"transfer_id": transferID,
			})
		} else {
			fmt.Println("[DEBUG] ERROR: Sender disconnected before download started")
		}

		c.Set("Content-Disposition", "attachment; filename="+transfer.Filename)
		return c.SendStream(reader)
	})

	log.Fatal(app.Listen(":" + port))

}

func getaddr() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		log.Fatal(err)
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
		err := client.Conn.WriteJSON(fiber.Map{
			"event": "devices_update",
			"users": activeusers,
		})
		if err != nil {
			fmt.Println("Error sending to", client.Name)
		}
	}
}
