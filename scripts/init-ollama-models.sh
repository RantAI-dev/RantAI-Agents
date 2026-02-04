#!/bin/bash
#
# Initialize Ollama with OCR models
#
# Usage:
#   ./init-ollama-models.sh [model1] [model2] ...
#   ./init-ollama-models.sh                     # Pull from env vars
#   ./init-ollama-models.sh glm-ocr             # Pull single model
#   ./init-ollama-models.sh glm-ocr minicpm-v:4.5  # Pull multiple
#
# Available models:
#   - glm-ocr        (0.9B, 2-3GB VRAM) - Fast, tables/figures
#   - moondream      (1.8B, 3-4GB)      - CPU-friendly
#   - qwen3-vl:2b    (2B, 4GB)          - Multilingual, CPU-friendly
#   - qwen3-vl:8b    (8B, 6-8GB)        - Better quality
#   - minicpm-v:2.6  (8B, 8GB)          - High-res images
#   - minicpm-v:4.5  (8B, 10-12GB)      - SOTA, handwriting
#

set -e

OLLAMA_HOST=${OLLAMA_ENDPOINT:-"http://localhost:11434"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}OCR Model Initialization Script${NC}"
echo "================================="
echo ""

# Function to pull a model
pull_model() {
  if [ -n "$1" ]; then
    echo -e "${YELLOW}Pulling $1...${NC}"
    if ollama pull "$1" 2>/dev/null; then
      echo -e "${GREEN}✓ $1 pulled successfully${NC}"
    else
      echo -e "${RED}✗ Failed to pull $1${NC}"
      return 1
    fi
  fi
}

# Wait for Ollama to be ready
echo "Waiting for Ollama at $OLLAMA_HOST..."
max_attempts=30
attempt=0
while ! curl -s "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo -e "${RED}Error: Ollama not available after ${max_attempts} attempts${NC}"
    echo ""
    echo "Make sure Ollama is running:"
    echo "  - Docker: docker compose up -d ollama"
    echo "  - Local:  ollama serve"
    exit 1
  fi
  echo "  Attempt $attempt/$max_attempts..."
  sleep 2
done
echo -e "${GREEN}Ollama is ready!${NC}"
echo ""

if [ $# -gt 0 ]; then
  # Pull models from command line arguments
  echo "Pulling specified models..."
  for model in "$@"; do
    pull_model "$model"
  done
else
  # Pull models from environment variables
  echo "Pulling models from environment variables..."

  # Collect unique models
  declare -A models_to_pull

  default_model="${OCR_MODEL_DEFAULT:-glm-ocr}"
  models_to_pull["$default_model"]=1

  [ -n "$OCR_MODEL_HANDWRITTEN" ] && models_to_pull["$OCR_MODEL_HANDWRITTEN"]=1
  [ -n "$OCR_MODEL_TABLE" ] && models_to_pull["$OCR_MODEL_TABLE"]=1
  [ -n "$OCR_MODEL_FIGURE" ] && models_to_pull["$OCR_MODEL_FIGURE"]=1

  echo "Models to pull: ${!models_to_pull[@]}"
  echo ""

  for model in "${!models_to_pull[@]}"; do
    pull_model "$model"
  done
fi

echo ""
echo -e "${GREEN}Done!${NC} Available models:"
ollama list 2>/dev/null || echo "  (Unable to list models)"
echo ""
echo "To use OCR, set these in your .env:"
echo "  OLLAMA_ENDPOINT=\"$OLLAMA_HOST\""
echo "  OCR_MODEL_DEFAULT=\"glm-ocr\""
