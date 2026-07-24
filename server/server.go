package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"sync"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/google/uuid"
)

type Client struct {
	ID   string
	Name string
	Conn *websocket.Conn
}

var clients = make(map[string]*Client)
var clientsMu sync.RWMutex

func main() {
	port := "3000"
	app := fiber.New()
	app.Use(cors.New())

	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		var id string = uuid.New().String()
		defaultName := fmt.Sprintf("device-%d", len(clients))
		clientsMu.Lock()
		clients[id] = &Client{
			ID:   id,
			Name: c.Query("name", defaultName),
			Conn: c,
		}
		clientsMu.Unlock()
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
			fmt.Printf("Received: %s %s \n", msg, strconv.Itoa(msgType))
		}
	}))
	app.Get("/", func(c fiber.Ctx) error {
		return c.SendFile("dist/main.html")
	})

	app.Post("/upload", func(c fiber.Ctx) error {
		fmt.Println("req recieved from", c.IP())
		id := c.FormValue("tarID")
		file, err := c.FormFile("document")
		tar := c.FormValue("target")
		filename := c.FormValue("filename")

		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "No file included")
		}
		err = c.SaveFile(file, fmt.Sprintf("./shared/%s", file.Filename))
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		clientsMu.Lock()
		target, exists := clients[id]
		clientsMu.Unlock()
		if exists {
			target.Conn.WriteJSON(fiber.Map{
				"event":    "incoming_file",
				"filename": filename,
				"sender":   c.IP(),
			})
			fmt.Printf(" Alerted %s, filename: %s", target.ID, filename)
		} else {
			fmt.Printf("Device not connected")
		}

		fmt.Printf(" /upload sucess to %s - %s \n", tar, filename)

		return c.JSON(fiber.Map{
			"status":   200,
			"filename": file.Filename,
			"size":     file.Size,
		})

	})

	app.Get("/download/:filename", func(c fiber.Ctx) error {
		var filename string = c.Params("filename")
		_, err := os.Stat("./shared/" + filename)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "File doesn't exist")
		}
		return c.Download("./shared/" + filename)
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
