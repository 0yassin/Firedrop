# Firedrop
## Description
Firedrop is a file transfer application for devices connected to the same wifi network, the application allows you to and recieve files directly over the local network using your web browser, the executable only has to run on one device that acts as a server, the application can then be used by visiting a specific local address.

## Screenshots
!(vertical screenshot)[https://raw.githubusercontent.com/0yassin/Firedrop/refs/heads/main/screenshots/vertical.png]
!(horizontal screenshot)[https://raw.githubusercontent.com/0yassin/Firedrop/refs/heads/main/screenshots/horizontal.png]

## Technologies used
- Frontend: TypeScript, React, Vite, Tailwind CSS (v4), Motion
- Backend: Go (Golang), Fiber (v3) web framework, WebSockets

## How to use
Visit the releases page and download the binary suited for your operation system from the options, the program should display an address such as: "running on 192.168.xx.xx:3000", you can visit that address to use the app.

note: on linux, you will have to run the app inside a terminal instead of simply double clicking the executable: 
- open your preferred terminal 
- navigate to the directory where you downloaded the executable file 
- run `./EXECUTABLE-NAME` | example: `./Firedrop-linux-amd64`
Alternatively, you can build the app yourself following the instructions below.

# Build Instructions:
## Prerequisites
Before you try to compile and run the application yourself make sure your system has the following installed:
- GO (1.22 or later)
- NodeJS (version 20 or later)
- npm 

## Instructions
### 1. Compile the frontend
- Clone the git repository by running: `git clone https://github.com/0yassin/Firedrop.git`
- Open your terminal and navigate to the newly cloned repository folder
- Navigate to the frontend directory by running: `cd client/firedrop-client`
- Install the necessary packages: `npm install`
- Build the frontend: `npm run build`
### 2. compile the GO binary
- Navigate to the server directory: `cd ../../server`
- Install the necessary packages: `go mod tidy`
- Compile the binary for your operating system:
    - for linux (64-bit): `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o Firedrop .`
    - for windows (64-bit): `CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o Firedrop.exe .`
    - for apple scilicone macos: `CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o Firedrop .`


# Common issues

### Other devices cannot open the web page
- The firewall on the host computer blocks incoming connections on port 3000.

### Devices on the network do not show in the Devices column
- The devices are likely connected to different networks or subnets, Make sure that all devices connect to the same Wi-Fi network.

### The application crashes during go build
- The dist folder is likely missing in the server directory, Run `npm run build` in the client directory before you run go build.
