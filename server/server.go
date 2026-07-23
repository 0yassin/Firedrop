package main

import (
	"fmt"
	"log"
	"net"
	"os"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
)

func main() {
	port := "3000"
	app := fiber.New()
	app.Use(cors.New())

	app.Get("/", func(c fiber.Ctx) error {
		return c.SendFile("dist/main.html")
	})

	app.Post("/upload", func(c fiber.Ctx) error {
		file, err := c.FormFile("document")
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "No file included")
		}
		err = c.SaveFile(file, fmt.Sprintf("./shared/%s", file.Filename))
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}

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
