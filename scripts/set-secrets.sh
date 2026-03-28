#!/bin/bash

# USAGE: ./set-secrets.sh dev

# Ensure an environment is specified
if [ -z "$1" ]; then
  echo "Usage: $0 <environment>"
  echo "e.g., $0 dev"
  exit 1
fi

# Select the appropriate file based on the environment
ENV_FILE=".env.server.$1"

# Check if the file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Environment file $ENV_FILE does not exist."
  exit 1
fi

# Read each line in the selected .env file
while IFS= read -r line || [ -n "$line" ]; do
  # Skip empty lines and lines starting with #
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Split the line into key and value
  IFS='=' read -r key value <<< "$line"
  
  # Trim any leading/trailing whitespace
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  
  # Set the GitHub secret
  echo "Setting secret for key: $key"
  gh secret set "$key" -b"$value"
done < "$ENV_FILE"
