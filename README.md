WIP


# Minilog 

Temu grafana. Ready for the brave new AI era (of atrocious RAM prices)

# Why consider minilog ?

- You actually pay for your servers 

- You don't like writing long yaml config files

- You like using postgres for everything

# How it works / requirements

1. Store your logs in using TimescaleDB (postgres extension)
2. Find some way to push logs into DB, I recommend [vector](https://vector.dev/) 
3. Spin up minilog to display logs & setup alerts 