# Task Tracker Application - DevOps Guide

This comprehensive guide covers the deployment, monitoring, and operational aspects of the Task Tracker application.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Local Development](#local-development)
3. [Docker & Containerization](#docker--containerization)
4. [CI/CD Pipelines](#cicd-pipelines)
5. [AWS Deployment](#aws-deployment)
6. [Monitoring & Observability](#monitoring--observability)
7. [Backup & Disaster Recovery](#backup--disaster-recovery)
8. [Security Best Practices](#security-best-practices)
9. [Troubleshooting](#troubleshooting)

## Architecture Overview

The Task Tracker application follows a modern cloud-native architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     Internet Users                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │  Application Load        │
        │  Balancer (ALB)          │
        │  (Public Subnets)        │
        └──────────┬───────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   ┌─────────────┐      ┌─────────────┐
   │  ECS Task   │      │  ECS Task   │
   │  (Private)  │      │  (Private)  │
   └──────┬──────┘      └──────┬──────┘
          │                    │
          └────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │  RDS MySQL Database      │
        │  (Private Subnets)       │
        │  Multi-AZ Deployment     │
        └──────────────────────────┘
```

### Key Components

- **Application Load Balancer (ALB)**: Distributes traffic across ECS tasks
- **ECS Fargate**: Serverless container orchestration
- **RDS MySQL**: Managed relational database with automatic backups
- **S3**: Object storage for application data
- **CloudWatch**: Centralized logging and monitoring
- **Prometheus & Grafana**: Metrics collection and visualization

## Local Development

### Prerequisites

- Docker & Docker Compose
- Node.js 22+
- pnpm package manager
- MySQL 8.0 (or use Docker)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd task-tracker-devops
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env.local
   ```

4. **Start local development environment**
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations**
   ```bash
   pnpm db:push
   ```

6. **Start development server**
   ```bash
   pnpm dev
   ```

The application will be available at `http://localhost:3000`

### Accessing Services

- **Application**: http://localhost:3000
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **MySQL**: localhost:3306

## Docker & Containerization

### Building Docker Images

#### Frontend/Backend Image
```bash
docker build -f Dockerfile.frontend -t task-tracker:latest .
```

#### Running Container Locally
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://user:pass@db:3306/task_tracker" \
  -e NODE_ENV=production \
  task-tracker:latest
```

### Multi-Stage Build Strategy

The Dockerfile uses multi-stage builds to optimize image size:

1. **Builder Stage**: Installs dependencies and builds the application
2. **Runtime Stage**: Contains only production dependencies and built artifacts

**Image Size Optimization**:
- Base image: `node:22-alpine` (minimal footprint)
- Production dependencies only
- Non-root user execution
- Health checks included

### Docker Compose for Local Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Clean up volumes
docker-compose down -v
```

## CI/CD Pipelines

### GitHub Actions Pipeline

Located in `.github/workflows/ci-cd.yml`

**Stages**:
1. **Lint**: Code quality checks and formatting
2. **Security**: Dependency scanning and vulnerability detection
3. **Test**: Unit tests with coverage reporting
4. **Build**: Docker image build and push to registry
5. **Deploy**: Staging and production deployments

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

**Environment Variables Required**:
- `STAGING_WEBHOOK_URL`: Staging deployment webhook
- `PRODUCTION_WEBHOOK_URL`: Production deployment webhook

### GitLab CI Pipeline

Located in `.gitlab-ci.yml`

**Stages**:
1. **Lint**: Code quality and security checks
2. **Test**: Unit tests
3. **Build**: Docker image creation
4. **Deploy**: Staging and production deployments

**Manual Approval**: Production deployments require manual approval

### Setting Up CI/CD

#### GitHub Actions

1. Create repository secrets:
   ```
   STAGING_WEBHOOK_URL
   PRODUCTION_WEBHOOK_URL
   ```

2. Ensure branch protection rules:
   - Require status checks to pass
   - Require code reviews

#### GitLab CI

1. Set CI/CD variables in GitLab:
   - `STAGING_WEBHOOK_URL`
   - `PRODUCTION_WEBHOOK_URL`

2. Configure protected branches

## AWS Deployment

### Prerequisites

- AWS Account with appropriate permissions
- Terraform installed (>= 1.0)
- AWS CLI configured
- S3 bucket for Terraform state

### Infrastructure Setup

1. **Create S3 bucket for Terraform state**
   ```bash
   aws s3api create-bucket \
     --bucket task-tracker-terraform-state \
     --region us-east-1
   
   # Enable versioning
   aws s3api put-bucket-versioning \
     --bucket task-tracker-terraform-state \
     --versioning-configuration Status=Enabled
   ```

2. **Create DynamoDB table for state locking**
   ```bash
   aws dynamodb create-table \
     --table-name terraform-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST
   ```

3. **Initialize Terraform**
   ```bash
   cd terraform
   terraform init
   ```

4. **Create terraform.tfvars**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

5. **Plan and Apply**
   ```bash
   terraform plan
   terraform apply
   ```

### Terraform Configuration

**Key Resources**:
- VPC with public and private subnets across 2 AZs
- NAT Gateways for private subnet egress
- Application Load Balancer
- ECS Cluster with Fargate launch type
- RDS MySQL Multi-AZ database
- S3 bucket for application data
- CloudWatch Log Groups
- Auto Scaling policies

**Variables** (see `terraform/variables.tf`):
- `aws_region`: AWS region (default: us-east-1)
- `environment`: Environment name (default: production)
- `db_instance_class`: RDS instance type (default: db.t3.micro)
- `container_cpu`: ECS task CPU units (default: 256)
- `container_memory`: ECS task memory in MB (default: 512)
- `desired_count`: Desired number of ECS tasks (default: 2)

### Deploying Application Updates

1. **Build and push Docker image**
   ```bash
   docker build -f Dockerfile.frontend -t ghcr.io/your-org/task-tracker:v1.0.0 .
   docker push ghcr.io/your-org/task-tracker:v1.0.0
   ```

2. **Update ECS task definition**
   ```bash
   # Update container_image variable
   terraform apply -var="container_image=ghcr.io/your-org/task-tracker:v1.0.0"
   ```

3. **Force ECS service update**
   ```bash
   aws ecs update-service \
     --cluster task-tracker-cluster \
     --service task-tracker-service \
     --force-new-deployment
   ```

## Monitoring & Observability

### Prometheus

**Configuration**: `monitoring/prometheus.yml`

**Scrape Targets**:
- Application metrics (port 3000)
- MySQL database metrics
- Docker metrics
- Node exporter metrics

**Retention**: 15 days (configurable)

### Grafana

**Access**: http://localhost:3001 (admin/admin)

**Pre-configured Dashboards**:
- Application Performance
- Database Metrics
- Infrastructure Health
- Error Rates and Latency

**Alert Rules**: `monitoring/prometheus_rules.yml`

**Key Alerts**:
- High error rate (>5%)
- High latency (p99 > 1s)
- Database connection pool exhaustion
- Disk space running out
- Memory usage high (>85%)
- CPU usage high (>80%)
- Service down
- Database down

### CloudWatch Integration (AWS)

**Log Groups**:
- `/ecs/task-tracker`: Application logs
- `/rds/task-tracker`: Database logs

**Metrics**:
- ECS task CPU and memory utilization
- ALB request count and latency
- RDS database connections and queries
- S3 bucket operations

**Alarms**:
```bash
# Create high error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name task-tracker-high-error-rate \
  --alarm-description "Alert when error rate is high" \
  --metric-name HTTPErrorRate \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

### Custom Metrics

Add custom metrics to your application:

```typescript
import { invokeLLM } from "./server/_core/llm";

// Example: Track task creation
const taskCreationMetric = {
  MetricName: 'TaskCreated',
  Value: 1,
  Unit: 'Count',
  Timestamp: new Date(),
};
```

## Backup & Disaster Recovery

### Database Backups

**Automated Backups**:
- Retention: 30 days
- Backup window: 03:00-04:00 UTC
- Multi-AZ: Automatic failover enabled

**Manual Backup**:
```bash
aws rds create-db-snapshot \
  --db-instance-identifier task-tracker-db \
  --db-snapshot-identifier task-tracker-db-backup-$(date +%Y%m%d)
```

**Restore from Snapshot**:
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier task-tracker-db-restored \
  --db-snapshot-identifier task-tracker-db-backup-20240101
```

### S3 Backup Strategy

**Versioning**: Enabled on application data bucket
**Lifecycle Policies**: Archive old versions after 90 days
**Cross-Region Replication**: Optional for disaster recovery

```bash
# Enable cross-region replication
aws s3api put-bucket-replication \
  --bucket task-tracker-app-data \
  --replication-configuration file://replication-config.json
```

### Disaster Recovery Plan

**RTO (Recovery Time Objective)**: 1 hour
**RPO (Recovery Point Objective)**: 15 minutes

**Recovery Steps**:

1. **Database Failure**:
   - RDS Multi-AZ automatic failover (< 2 minutes)
   - Or restore from snapshot (< 15 minutes)

2. **Application Failure**:
   - ECS auto-scaling launches new tasks (< 5 minutes)
   - ALB routes traffic to healthy tasks

3. **Complete Region Failure**:
   - Terraform apply in new region (< 30 minutes)
   - Restore database from snapshot (< 15 minutes)
   - Update DNS records (< 5 minutes)

## Security Best Practices

### Network Security

- **VPC Isolation**: Application in private subnets
- **Security Groups**: Least privilege access
- **NACLs**: Additional network layer protection
- **WAF**: Optional AWS WAF for ALB

### Data Security

- **Encryption at Rest**: RDS encrypted with KMS
- **Encryption in Transit**: TLS/SSL for all communications
- **Database Credentials**: Stored in AWS Secrets Manager

```bash
# Store database credentials
aws secretsmanager create-secret \
  --name task-tracker/db/credentials \
  --secret-string '{"username":"admin","password":"SecurePassword123"}'
```

### Application Security

- **Container Scanning**: Trivy vulnerability scanning in CI/CD
- **Dependency Scanning**: npm audit in pipeline
- **OWASP Compliance**: Regular security audits
- **Secrets Management**: No hardcoded credentials

### Access Control

- **IAM Roles**: Least privilege for ECS tasks
- **RBAC**: Application-level role-based access control
- **Audit Logging**: CloudTrail for AWS API calls
- **Application Logs**: Centralized logging in CloudWatch

### SSL/TLS Configuration

```bash
# Create ACM certificate
aws acm request-certificate \
  --domain-name task-tracker.example.com \
  --validation-method DNS

# Update ALB listener to HTTPS
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTPS \
  --certificates CertificateArn=arn:aws:acm:...
```

## Troubleshooting

### Common Issues

#### 1. ECS Tasks Failing to Start

**Symptoms**: Tasks stuck in PROVISIONING state

**Solutions**:
```bash
# Check task logs
aws ecs describe-tasks \
  --cluster task-tracker-cluster \
  --tasks <task-arn>

# View CloudWatch logs
aws logs tail /ecs/task-tracker --follow

# Check container image availability
aws ecr describe-images \
  --repository-name task-tracker
```

#### 2. Database Connection Issues

**Symptoms**: Application unable to connect to RDS

**Solutions**:
```bash
# Verify security group rules
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx

# Test database connectivity
mysql -h task-tracker-db.xxxxx.rds.amazonaws.com \
  -u admin -p task_tracker

# Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier task-tracker-db
```

#### 3. High Memory/CPU Usage

**Symptoms**: ECS tasks consuming excessive resources

**Solutions**:
```bash
# Check Grafana dashboards for bottlenecks
# Increase container memory/CPU in terraform/variables.tf
# Scale up desired task count
terraform apply -var="desired_count=4"

# Analyze application logs for memory leaks
aws logs filter-log-events \
  --log-group-name /ecs/task-tracker \
  --filter-pattern "memory"
```

#### 4. ALB Health Check Failures

**Symptoms**: Targets marked unhealthy

**Solutions**:
```bash
# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:...

# Verify application health endpoint
curl http://localhost:3000/health

# Check security group allows ALB traffic
# Ensure application listens on correct port (3000)
```

### Monitoring Commands

```bash
# View ECS service status
aws ecs describe-services \
  --cluster task-tracker-cluster \
  --services task-tracker-service

# Get recent logs
aws logs tail /ecs/task-tracker --since 1h

# Monitor CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=task-tracker-service \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 300 \
  --statistics Average

# Check Terraform state
terraform show
terraform state list
```

## Support & Documentation

- **Application README**: See main `README.md`
- **API Documentation**: See `API.md`
- **Terraform Documentation**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- **AWS ECS Documentation**: https://docs.aws.amazon.com/ecs/
- **Prometheus Documentation**: https://prometheus.io/docs/
- **Grafana Documentation**: https://grafana.com/docs/

## License

This project is licensed under the MIT License.
