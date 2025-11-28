# Notification Service

A comprehensive notification microservice built with NestJS that handles email, in-app, SMS, and push notifications for the mental health platform.

## Features

### Core Functionality

- ✅ **Email Notifications** - Using NestJS Mailer with Handlebars templates
- ✅ **In-App Notifications** - Real-time notifications within the application
- 🔄 **SMS Notifications** - Ready for integration with Twilio/AWS SNS
- 🔄 **Push Notifications** - Ready for Web Push/Firebase integration
- ✅ **Queue Management** - Bull Redis queues for reliable delivery
- ✅ **Template System** - Dynamic email templates with Handlebars
- ✅ **User Preferences** - Granular notification control per user
- ✅ **Scheduling** - Schedule notifications for future delivery
- ✅ **Retry Logic** - Automatic retry with exponential backoff
- ✅ **Bulk Operations** - Send notifications to multiple users

### Integration Features

- ✅ **Scheduler Service Integration** - Appointment reminders and notifications
- ✅ **User Service Integration** - User data and authentication
- ✅ **Health Checks** - Service monitoring and diagnostics
- ✅ **Metrics** - Prometheus metrics for monitoring
- ✅ **API Documentation** - Swagger/OpenAPI documentation

## Architecture

```
notification-service/
├── src/
│   ├── notifications/           # Core notification logic
│   │   ├── entities/           # Database entities
│   │   ├── services/           # Business logic
│   │   ├── controllers/        # API endpoints
│   │   ├── processors/         # Queue processors
│   │   └── dto/               # Data transfer objects
│   ├── preferences/            # User notification preferences
│   ├── templates/             # Email template management
│   ├── health/               # Health checks
│   └── common/               # Shared utilities
├── templates/                # Email templates (Handlebars)
└── Dockerfile               # Container configuration
```

## API Endpoints

### Notifications

- `POST /api/v1/notifications` - Send a notification
- `POST /api/v1/notifications/bulk` - Send bulk notifications
- `POST /api/v1/notifications/schedule` - Schedule a notification
- `GET /api/v1/notifications/my` - Get user notifications
- `PATCH /api/v1/notifications/:id/read` - Mark as read
- `PATCH /api/v1/notifications/read-all` - Mark all as read
- `DELETE /api/v1/notifications/:id` - Delete notification

### Appointment Integration

- `POST /api/v1/notifications/appointment/reminder` - Send appointment reminder
- `POST /api/v1/notifications/appointment/confirmed` - Send confirmation
- `POST /api/v1/notifications/appointment/cancelled` - Send cancellation

### Preferences

- `GET /api/v1/notification-preferences` - Get user preferences
- `PUT /api/v1/notification-preferences` - Update preferences

### Templates

- `GET /api/v1/notification-templates` - List templates
- `GET /api/v1/notification-templates/:name` - Get template
- `POST /api/v1/notification-templates` - Create template
- `PUT /api/v1/notification-templates/:name` - Update template

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Redis (Queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
MAIL_FROM="Support <noreply@serenityspace.app>"

# JWT
JWT_SECRET=your-secret-key
SERVICE_JWT_TOKEN=service-to-service-token

# Service
PORT_NOTIFICATION=4004
NODE_ENV=development
```

### Email Configuration

The service supports various SMTP providers:

#### Gmail

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password  # Use App Password
```

#### SendGrid

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
```

#### AWS SES

```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-username
SMTP_PASSWORD=your-ses-password
```

## Usage Examples

### Sending a Simple Notification

```typescript
const notificationData = {
  userId: 'user-uuid',
  type: NotificationType.EMAIL,
  title: 'Welcome!',
  message: 'Welcome to our platform',
  category: 'system',
  immediate: true,
};

const notification =
  await notificationService.sendNotification(notificationData);
```

### Scheduling a Notification

```typescript
const scheduledNotification = {
  userId: 'user-uuid',
  type: NotificationType.EMAIL,
  title: 'Appointment Tomorrow',
  message: 'Your appointment is tomorrow at 2 PM',
  category: 'appointments',
  scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
};
```

### Bulk Notifications

```typescript
const bulkNotification = {
  userIds: ['user1-uuid', 'user2-uuid', 'user3-uuid'],
  type: NotificationType.PUSH,
  title: 'System Maintenance',
  message: 'Scheduled maintenance tonight at midnight',
  category: 'system',
};

const result =
  await notificationService.sendBulkNotifications(bulkNotification);
```

### Integration with Scheduler Service

The notification service automatically receives appointment notifications from the scheduler service:

```typescript
// In scheduler service
await notificationIntegrationService.sendAppointmentReminder({
  userId: 'user-uuid',
  counselorId: 'counselor-uuid',
  appointmentId: 'appointment-uuid',
  appointmentDate: '2024-01-15',
  appointmentTime: '14:00',
  userName: 'John Doe',
  counselorName: 'Dr. Smith',
  reminderType: 'email',
  minutesBefore: 60,
});
```

## Database Schema

### Notifications Table

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    status notification_status DEFAULT 'pending',
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    -- ... other fields
);
```

### Notification Preferences Table

```sql
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    notification_category VARCHAR(50) NOT NULL,
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT true,
    in_app_enabled BOOLEAN DEFAULT true,
    frequency VARCHAR(20) DEFAULT 'immediate',
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    -- ... other fields
);
```

## Queue Management

The service uses Bull queues for reliable message delivery:

### Queue Types

- **scheduled-notification** - For future delivery
- **retry-notification** - For failed message retry
- **bulk-notification** - For bulk operations

### Queue Configuration

```typescript
{
  removeOnComplete: 50,
  removeOnFail: 100,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
}
```

## Template System

### Available Templates

- `appointment_reminder` - Appointment reminders
- `appointment_confirmed` - Appointment confirmations
- `appointment_cancelled` - Appointment cancellations
- `welcome` - Welcome messages
- `password_reset` - Password reset emails

### Template Variables

Templates support Handlebars syntax with custom helpers:

```handlebars
<h1>Hi {{userName}}!</h1>
<p>Your appointment with
  {{counselorName}}
  is on
  {{formatDate appointmentDate}}
  at
  {{appointmentTime}}.</p>
{{#if (eq meetingType 'video_call')}}
  <a href='{{meetingRoomUrl}}'>Join Video Call</a>
{{/if}}
```

### Custom Helpers

- `formatDate` - Format dates
- `formatTime` - Format times
- `capitalize` - Capitalize strings
- `truncate` - Truncate text
- `eq`, `ne`, `gt`, `lt` - Comparison helpers

## Monitoring & Health Checks

### Health Endpoint

```bash
GET /health
```

Returns:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

### Prometheus Metrics

- `notification_service_*` - Standard Node.js metrics
- Queue metrics from Bull dashboard
- Custom notification delivery metrics

## Development

### Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Start development server
npm run start:dev
```

### Docker Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f notification-service

# Run migrations (if needed)
docker-compose exec notification-service npm run migration:run
```

### Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Deployment

### Docker Production

```bash
# Build production image
docker build -t notification-service:latest .

# Run production container
docker run -d \
  --name notification-service \
  -p 4004:4004 \
  --env-file .env \
  notification-service:latest
```

### Environment-Specific Configuration

- Development: Auto-reload, detailed logging
- Staging: Production build, debug logging
- Production: Optimized build, error logging only

## Future Enhancements

### SMS Integration

```typescript
// Twilio example
await this.twilioClient.messages.create({
  body: notification.message,
  from: this.configService.get('TWILIO_PHONE_NUMBER'),
  to: user.phoneNumber,
});
```

### Push Notifications

```typescript
// Web Push example
await webpush.sendNotification(
  {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dhKey,
      auth: subscription.authKey,
    },
  },
  JSON.stringify({
    title: notification.title,
    body: notification.message,
    data: notification.data,
  }),
);
```

### WebSocket Integration

```typescript
// Real-time notifications
@WebSocketGateway()
export class NotificationGateway {
  @SubscribeMessage('join-user-room')
  joinRoom(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(`user:${userId}`);
  }

  emitToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
```

## Support

For questions or issues:

1. Check the API documentation at `/docs`
2. Review health status at `/health`
3. Monitor queue status via Bull dashboard
4. Check application logs for errors

The notification service is designed to be reliable, scalable, and easily extensible for future notification channels.
