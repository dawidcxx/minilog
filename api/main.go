package main

import (
	"log"
)

func main() {
	env := loadEnv()

	stateDB, err := openStateDB(env.stateDBPath)
	if err != nil {
		log.Fatalf("open sqlite: %v", err)
	}
	defer stateDB.Close()

	if err := initStateDB(stateDB); err != nil {
		log.Fatalf("init sqlite schema: %v", err)
	}

	logsDB, err := openLogsDB(env.pgURL)
	if err != nil {
		log.Fatalf("open postgres: %v", err)
	}
	defer logsDB.Close()

	s := newServer(env, stateDB, logsDB)

	port := defaultPort
	log.Printf("server running on %s", port)
	log.Fatal(s.serve(":" + port))
}
