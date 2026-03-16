package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

func apiHello(w http.ResponseWriter, r *http.Request) {
	resp := map[string]string{
		"message": "hello from go api",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/hello", apiHello)

	// serve frontend if built
	if _, err := os.Stat("./frontend/dist"); err == nil {
		fs := http.FileServer(http.Dir("./frontend/dist"))
		mux.Handle("/", fs)
	}

	port := "8080"

	log.Printf("server running on %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}