# Task Tracker Application - Deployment Runbook

This runbook provides step-by-step instructions for deploying and managing the Task Tracker application.

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Local Development Deployment](#local-development-deployment)
3. [Staging Deployment](#staging-deployment)
4. [Production Deployment](#production-deployment)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Maintenance Operations](#maintenance-operations)

## Initial Setup

### Prerequisites

Ensure you have the following installed:

```bash
# Check versions
node --version          # v22.0.0 or higher
pnpm --version         # 10.0.0 or higher
docker --version       # 24.0.0 or higher
docker-compose --version # 2.0.0 or higher
terraform --version    # 1.0.0 or higher
aws --version          # 2.0.0 or higher
```

### AWS Account Setup

1. **Create IAM User for Terraform**
   ```bash
   aws iam create-user --user-name terraform-user
   aws iam attach-user-policy --user-name terraform-user \
     --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
   aws iam create-access-key --user-name terraform-user
   ```

2. **Configure AWS CLI**
   ```bash
   aws configure
   # Enter Access Key ID
   # Enter Secret Access Key
   # Enter Default region (us-east-1)
   # Enter Default output format (json)
   ```

3. **Create S3 Bucket for Terraform State**
   ```bash
   aws s3api create-bucket \
     --bucket task-tracker-terraform-state-$(date +%s) \
     --region us-east-1
   
   # Enable versioning
   aws s3api put-bucket-versioning \
     --bucket task-tracker-terraform-state-xxxxx \
     --versioning-configuration Status=Enabled
   ```

4. **Create DynamoDB Table for State Locking**
   ```bash
   aws dynamodb create-table \
     --table-name terraform-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST
   ```

### Repository Setup

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd task-tracker-devops
   ```

2. **Create Environment Files**
   ```bash
   cp .env.example .env.local
   cp terraform/terraform.tfvars.example terraform/terraform.tfvars
   ```

3. **Update Configuration Files**
   ```bash
   # Edit .env.local with your settings
   vim .env.local
   
   # Edit terraform/terraform.tfvars with AWS values
   vim terraform/terraform.tfvars
   ```

## Local Development Deployment

### Quick Start

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Start Docker Compose**
   ```bash
   docker-compose up -d
   
   # Verify services are running
   docker-compose ps
   ```

3. **Initialize Database**
   ```bash
   pnpm db:push
   ```

4. **Start Development Server**
   ```bash
   pnpm dev
   ```

5. **Access Application**
   - Application: http://localhost:3000
   - Grafana: http://localhost:3001 (admin/admin)
   - Prometheus: http://localhost:9090

### Troubleshooting Local Setup

**Port Already in Use**
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 pnpm dev
```

**Database Connection Failed**
```bash
# Check MySQL is running
docker-compose ps db

# Check logs
docker-compose logs db

# Restart database
docker-compose restart db
```

**Docker Compose Issues**
```bash
# Clean up all containers
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Start fresh
docker-compose up -d
```

## Staging Deployment

### Prerequisites

- AWS account with appropriate permissions
- Docker image pushed to registry
- Terraform initialized

### Deployment Steps

1. **Prepare Terraform**
   ```bash
   cd terraform
   
   # Initialize Terraform (first time only)
   terraform init
   
   # Create staging workspace
   terraform workspace new staging
   terraform workspace select staging
   ```

2. **Update Terraform Variables**
   ```bash
   # Create staging tfvars
   cp terraform.tfvars terraform.tfvars.staging
   
   # Edit for staging environment
   vim terraform.tfvars.staging
   
   # Key changes:
   # - environment = "staging"
   # - db_instance_class = "db.t3.micro"
   # - desired_count = 1
   # - container_image = "ghcr.io/your-org/task-tracker:staging"
   ```

3. **Plan Deployment**
   ```bash
   terraform plan -var-file=terraform.tfvars.staging -out=staging.tfplan
   
   # Review the plan carefully
   ```

4. **Apply Configuration**
   ```bash
   terraform apply staging.tfplan
   
   # Note the outputs
   # - alb_dns_name
   # - rds_endpoint
   # - ecs_cluster_name
   ```

5. **Verify Deployment**
   ```bash
   # Check ECS cluster
   aws ecs describe-clusters --clusters task-tracker-cluster
   
   # Check running tasks
   aws ecs list-tasks --cluster task-tracker-cluster
   
   # Get ALB DNS name
   aws elbv2 describe-load-balancers \
     --names task-tracker-alb
   ```

6. **Access Staging Environment**
   ```bash
   # Get ALB DNS name from Terraform output
   ALB_DNS=$(terraform output -raw alb_dns_name)
   
   # Access application
   curl http://$ALB_DNS
   ```

### Staging Health Checks

```bash
# Check application health
curl http://$ALB_DNS/health

# Check database connectivity
mysql -h $(terraform output -raw rds_endpoint) \
  -u admin -p task_tracker

# Monitor logs
aws logs tail /ecs/task-tracker --follow

# Check Prometheus metrics
curl http://prometheus:9090/api/v1/query?query=up
```

## Production Deployment

### Pre-Deployment Checklist

- [ ] Code reviewed and merged to main branch
- [ ] All tests passing
- [ ] Security scanning completed
- [ ] Docker image built and scanned
- [ ] Backup of current database created
- [ ] Rollback plan documented
- [ ] Team notified of deployment
- [ ] Monitoring dashboards prepared

### Deployment Steps

1. **Prepare Production Environment**
   ```bash
   cd terraform
   
   # Create production workspace
   terraform workspace new production
   terraform workspace select production
   ```

2. **Update Production Variables**
   ```bash
   # Create production tfvars
   cp terraform.tfvars terraform.tfvars.prod
   
   # Edit for production
   vim terraform.tfvars.prod
   
   # Key settings:
   # - environment = "production"
   # - db_instance_class = "db.t3.small"
   # - db_allocated_storage = 100
   # - desired_count = 2
   # - container_image = "ghcr.io/your-org/task-tracker:v1.0.0"
   ```

3. **Create Database Backup**
   ```bash
   # Create snapshot before deployment
   aws rds create-db-snapshot \
     --db-instance-identifier task-tracker-db \
     --db-snapshot-identifier task-tracker-db-pre-deploy-$(date +%Y%m%d-%H%M%S)
   
   # Wait for snapshot to complete
   aws rds describe-db-snapshots \
     --db-snapshot-identifier task-tracker-db-pre-deploy-xxxxx
   ```

4. **Plan Deployment**
   ```bash
   terraform plan -var-file=terraform.tfvars.prod -out=prod.tfplan
   
   # Review plan for any destructive changes
   # Look for "destroy" or "force_new_deployment"
   ```

5. **Apply Configuration**
   ```bash
   # Get approval from team lead
   terraform apply prod.tfplan
   
   # Monitor the deployment
   watch -n 5 'aws ecs describe-services \
     --cluster task-tracker-cluster \
     --services task-tracker-service'
   ```

6. **Monitor Deployment Progress**
   ```bash
   # Watch task status
   aws ecs describe-services \
     --cluster task-tracker-cluster \
     --services task-tracker-service \
     --query 'services[0].[desiredCount,runningCount,pendingCount]'
   
   # Check target health
   aws elbv2 describe-target-health \
     --target-group-arn <target-group-arn>
   ```

7. **Verify Production Deployment**
   ```bash
   # Get ALB DNS
   ALB_DNS=$(terraform output -raw alb_dns_name)
   
   # Health check
   curl http://$ALB_DNS/health
   
   # Check logs
   aws logs tail /ecs/task-tracker --follow
   
   # Verify database
   mysql -h $(terraform output -raw rds_endpoint) \
     -u admin -p task_tracker
   ```

### Production Deployment Timeline

| Step | Duration | Notes |
|------|----------|-------|
| Plan | 5 min | Review for issues |
| Apply | 10 min | Infrastructure creation |
| Task Launch | 5 min | ECS tasks starting |
| Health Checks | 2 min | ALB health checks |
| Smoke Tests | 5 min | Basic functionality |
| Full Verification | 10 min | Complete testing |
| **Total** | **37 min** | Typical deployment |

## Post-Deployment Verification

### Immediate Checks (0-5 minutes)

```bash
# 1. Check service status
aws ecs describe-services \
  --cluster task-tracker-cluster \
  --services task-tracker-service

# 2. Verify tasks are running
aws ecs list-tasks --cluster task-tracker-cluster

# 3. Check ALB health
aws elbv2 describe-target-health \
  --target-group-arn <arn>

# 4. Test application endpoint
curl -I http://$ALB_DNS
```

### Health Checks (5-15 minutes)

```bash
# 1. Check application logs
aws logs tail /ecs/task-tracker --follow --since 5m

# 2. Verify database connectivity
mysql -h $RDS_ENDPOINT -u admin -p task_tracker \
  -e "SELECT COUNT(*) FROM tasks;"

# 3. Check metrics in Prometheus
curl "http://prometheus:9090/api/v1/query?query=up"

# 4. Monitor Grafana dashboards
# Access http://grafana:3000 and review dashboards
```

### Functional Tests (15-30 minutes)

```bash
# 1. Create test task
curl -X POST http://$ALB_DNS/api/trpc/task.create \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Task","priority":"medium"}'

# 2. List tasks
curl http://$ALB_DNS/api/trpc/task.list

# 3. Get statistics
curl http://$ALB_DNS/api/trpc/task.stats

# 4. Test authentication
curl http://$ALB_DNS/api/trpc/auth.me
```

### Performance Baseline (30-60 minutes)

```bash
# 1. Monitor CPU/Memory
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=task-tracker-service \
  --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# 2. Check error rates
aws logs filter-log-events \
  --log-group-name /ecs/task-tracker \
  --filter-pattern "ERROR"

# 3. Verify backups are running
aws rds describe-db-instances \
  --db-instance-identifier task-tracker-db \
  --query 'DBInstances[0].[BackupRetentionPeriod,PreferredBackupWindow]'
```

## Rollback Procedures

### Quick Rollback (< 5 minutes)

If deployment has critical issues, perform immediate rollback:

```bash
# 1. Get previous task definition
PREVIOUS_TASK_DEF=$(aws ecs describe-services \
  --cluster task-tracker-cluster \
  --services task-tracker-service \
  --query 'services[0].taskDefinition' | grep -oP '\d+$')

PREVIOUS_TASK_DEF=$((PREVIOUS_TASK_DEF - 1))

# 2. Update service with previous task definition
aws ecs update-service \
  --cluster task-tracker-cluster \
  --service task-tracker-service \
  --task-definition task-tracker:$PREVIOUS_TASK_DEF

# 3. Monitor rollback
watch -n 5 'aws ecs describe-services \
  --cluster task-tracker-cluster \
  --services task-tracker-service'

# 4. Verify rollback successful
curl http://$ALB_DNS/health
```

### Full Rollback (< 30 minutes)

If infrastructure changes need rollback:

```bash
# 1. Identify previous Terraform state
terraform state list

# 2. Review previous state
terraform show

# 3. Rollback to previous version
git checkout HEAD~1 terraform/

# 4. Plan rollback
terraform plan -var-file=terraform.tfvars.prod

# 5. Apply rollback
terraform apply -var-file=terraform.tfvars.prod

# 6. Verify services restored
aws ecs describe-services \
  --cluster task-tracker-cluster \
  --services task-tracker-service
```

### Database Rollback

If database migration failed:

```bash
# 1. Stop application
aws ecs update-service \
  --cluster task-tracker-cluster \
  --service task-tracker-service \
  --desired-count 0

# 2. Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier task-tracker-db-restored \
  --db-snapshot-identifier task-tracker-db-pre-deploy-xxxxx

# 3. Wait for restore to complete
aws rds describe-db-instances \
  --db-instance-identifier task-tracker-db-restored

# 4. Update connection string
# Update environment variable in ECS task definition

# 5. Start application
aws ecs update-service \
  --cluster task-tracker-cluster \
  --service task-tracker-service \
  --desired-count 2
```

## Maintenance Operations

### Regular Maintenance Schedule

| Operation | Frequency | Duration | Impact |
|-----------|-----------|----------|--------|
| Database Backup | Daily | 5 min | None |
| Log Rotation | Weekly | 1 min | None |
| Security Patches | Monthly | 30 min | Downtime |
| Database Optimization | Monthly | 1 hour | Low |
| Capacity Review | Quarterly | 2 hours | None |

### Database Maintenance

```bash
# 1. Analyze tables
mysql -h $RDS_ENDPOINT -u admin -p task_tracker \
  -e "ANALYZE TABLE tasks, users, audit_logs;"

# 2. Optimize tables
mysql -h $RDS_ENDPOINT -u admin -p task_tracker \
  -e "OPTIMIZE TABLE tasks, users, audit_logs;"

# 3. Check table status
mysql -h $RDS_ENDPOINT -u admin -p task_tracker \
  -e "CHECK TABLE tasks, users, audit_logs;"

# 4. View slow queries
mysql -h $RDS_ENDPOINT -u admin -p task_tracker \
  -e "SELECT * FROM mysql.slow_log LIMIT 10;"
```

### Log Management

```bash
# 1. Archive old logs
aws logs create-export-task \
  --log-group-name /ecs/task-tracker \
  --from $(date -d '30 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination task-tracker-logs \
  --destination-prefix logs/

# 2. Check log size
aws logs describe-log-groups \
  --log-group-name-prefix /ecs/task-tracker

# 3. Update retention
aws logs put-retention-policy \
  --log-group-name /ecs/task-tracker \
  --retention-in-days 30
```

### Scaling Operations

```bash
# 1. Increase desired task count
aws ecs update-service \
  --cluster task-tracker-cluster \
  --service task-tracker-service \
  --desired-count 4

# 2. Update database instance class
terraform apply -var="db_instance_class=db.t3.small"

# 3. Increase storage
terraform apply -var="db_allocated_storage=100"

# 4. Monitor scaling
watch -n 5 'aws ecs describe-services \
  --cluster task-tracker-cluster \
  --services task-tracker-service'
```

### Security Updates

```bash
# 1. Check for available updates
aws rds describe-pending-maintenance-actions

# 2. Schedule maintenance window
aws rds modify-db-instance \
  --db-instance-identifier task-tracker-db \
  --preferred-maintenance-window "sun:03:00-sun:04:00" \
  --apply-immediately

# 3. Apply updates
aws rds apply-pending-maintenance-action \
  --resource-identifier arn:aws:rds:us-east-1:xxxxx:db:task-tracker-db \
  --apply-action system-update
```

## Emergency Procedures

### Service Down

1. **Immediate Response**
   ```bash
   # Check service status
   aws ecs describe-services \
     --cluster task-tracker-cluster \
     --services task-tracker-service
   
   # Check task logs
   aws logs tail /ecs/task-tracker --follow
   
   # Restart service
   aws ecs update-service \
     --cluster task-tracker-cluster \
     --service task-tracker-service \
     --force-new-deployment
   ```

2. **Investigation**
   - Check CloudWatch alarms
   - Review recent deployments
   - Check database connectivity
   - Review application logs

3. **Resolution**
   - Apply hotfix if available
   - Rollback to previous version
   - Scale up resources if needed

### Database Down

1. **Immediate Response**
   ```bash
   # Check RDS status
   aws rds describe-db-instances \
     --db-instance-identifier task-tracker-db
   
   # Check failover status
   aws rds describe-db-instances \
     --db-instance-identifier task-tracker-db \
     --query 'DBInstances[0].[DBInstanceStatus,MultiAZ]'
   ```

2. **Automatic Failover**
   - RDS Multi-AZ automatically fails over (< 2 minutes)
   - Monitor failover progress
   - Verify application reconnects

3. **Manual Intervention**
   - If auto-failover fails, restore from snapshot
   - Update connection strings
   - Restart application services

## Support & Escalation

**On-Call Engineer**: [Contact Info]
**Escalation**: [Manager Contact]
**Incident Channel**: #task-tracker-incidents

For questions or issues, refer to:
- DEVOPS_README.md - Comprehensive guide
- ARCHITECTURE.md - System design
- Application README.md - Feature documentation
