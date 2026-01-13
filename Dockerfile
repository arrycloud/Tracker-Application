FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

EXPOSE 5000

CMD ["npm", "start"]"]
