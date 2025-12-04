import schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid';
import { userService, messageCountService, messageLogService } from './database.js';

class MessageScheduler {
    constructor(whatsappClient) {
        this.whatsappClient = whatsappClient;
        this.jobs = new Map();
        this.io = whatsappClient.io; // Access to socket.io for emitting events
    }

    // Schedule a single message (mediaPath/caption pueden ser string o arrays)
    scheduleMessage(to, message, mediaPath, caption, scheduledDate, userId = null) {
        const jobId = uuidv4();
        console.log(`Scheduling message to ${to} at ${scheduledDate} for user ${userId}`);

        const job = schedule.scheduleJob(scheduledDate, async () => {
            try {
                console.log(`Executing scheduled message to ${to}`);
                await this.whatsappClient.sendMessage(to, message || '', mediaPath, caption || '');
                console.log(`Scheduled message sent to ${to}`);
                
                // Increment message count (only if userId is provided)
                if (userId) {
                    await messageCountService.incrementCount(userId, 1);
                    console.log(`Incremented message count for user ${userId}: +1 message (scheduled)`);
                    
                    // Log message to database
                    await messageLogService.logMessage(
                        userId,
                        'single',
                        to,
                        'sent',
                        message || '[Archivo multimedia]',
                        scheduledDate
                    );
                } else {
                    console.warn('Cannot increment message count: userId is missing for scheduled message');
                }
                
                // Emit log event for dashboard with userId
                if (this.io) {
                    this.io.emit('message_log', {
                        id: `scheduled-${jobId}`,
                        userId: userId || null,
                        target: to,
                        status: 'sent',
                        timestamp: new Date(),
                        content: message || '[Archivo multimedia]',
                        messageType: 'single' // Include message type
                    });
                }
            } catch (error) {
                console.error(`Failed to send scheduled message to ${to}:`, error);
                
                // Log failed message to database (only if userId is provided)
                if (userId) {
                    await messageLogService.logMessage(
                        userId,
                        'single',
                        to,
                        'failed',
                        message || '[Archivo multimedia]',
                        scheduledDate
                    );
                }
                
                // Emit log event for failed message with userId
                if (this.io) {
                    this.io.emit('message_log', {
                        id: `scheduled-${jobId}`,
                        userId: userId || null,
                        target: to,
                        status: 'failed',
                        timestamp: new Date(),
                        content: message || '[Archivo multimedia]',
                        messageType: 'single' // Include message type
                    });
                }
            } finally {
                this.jobs.delete(jobId);
            }
        });

        if (job) {
            this.jobs.set(jobId, {
                type: 'single',
                to,
                scheduledDate,
                job,
                userId,
                message,
                mediaPath,
                caption
            });
            return jobId;
        }
        return null;
    }

    // Schedule bulk messages
    scheduleBulkMessages(contacts, message, mediaPath, caption, delay, scheduledDate, userId = null, maxContactsPerBatch = null, waitTimeBetweenBatches = null) {
        const jobId = uuidv4();
        console.log(`Scheduling bulk messages for ${contacts.length} contacts at ${scheduledDate} for user ${userId}`);

        const job = schedule.scheduleJob(scheduledDate, async () => {
            try {
                console.log(`Executing scheduled bulk messages`);
                // sendBulkMessages already emits bulk_progress events, which are handled in App.tsx
                // Those events will automatically add logs to the dashboard
                const results = await this.whatsappClient.sendBulkMessages(contacts, message || '', mediaPath, caption || '', delay, userId, maxContactsPerBatch, waitTimeBetweenBatches);
                
                // Increment message count for successful sends (only if userId is provided)
                if (userId) {
                    const successCount = results.filter(r => r.status === 'sent').length;
                    if (successCount > 0) {
                        await messageCountService.incrementCount(userId, successCount);
                        console.log(`Incremented message count for user ${userId}: +${successCount} messages (scheduled bulk)`);
                    }
                } else {
                    console.warn('Cannot increment message count: userId is missing for scheduled bulk messages');
                }
                
                // Also emit a summary log event for the scheduled bulk send with userId
                if (this.io) {
                    const successCount = results.filter(r => r.status === 'sent').length;
                    this.io.emit('message_log', {
                        id: `scheduled-bulk-${jobId}`,
                        userId: userId || null,
                        target: `${contacts.length} contactos`,
                        status: 'sent',
                        timestamp: new Date(),
                        content: `Envío masivo programado completado (${successCount}/${contacts.length} mensajes)`,
                        messageType: 'bulk' // Include message type
                    });
                }
            } catch (error) {
                console.error(`Failed to execute scheduled bulk messages:`, error);
                
                // Emit error log for scheduled bulk send with userId
                if (this.io) {
                    this.io.emit('message_log', {
                        id: `scheduled-bulk-${jobId}`,
                        userId: userId || null,
                        target: `${contacts.length} contactos`,
                        status: 'failed',
                        timestamp: new Date(),
                        content: `Error en envío masivo programado: ${error.message}`,
                        messageType: 'bulk' // Include message type
                    });
                }
            } finally {
                this.jobs.delete(jobId);
            }
        });

        if (job) {
            this.jobs.set(jobId, {
                type: 'bulk',
                count: contacts.length,
                scheduledDate,
                job,
                userId,
                contacts,
                message,
                mediaPath,
                caption,
                delay,
                maxContactsPerBatch,
                waitTimeBetweenBatches
            });
            return jobId;
        }
        return null;
    }

    // Schedule group messages
    scheduleGroupMessages(groupIds, message, mediaPath, caption, scheduledDate, userId = null) {
        const jobId = uuidv4();
        console.log(`Scheduling group messages for ${groupIds.length} groups at ${scheduledDate} for user ${userId}`);

        const job = schedule.scheduleJob(scheduledDate, async () => {
            try {
                console.log(`Executing scheduled group messages`);
                
                // Get group names for better logging
                let groupNamesMap = {};
                try {
                    const groups = await this.whatsappClient.getGroups();
                    groups.forEach(group => {
                        groupNamesMap[group.id] = group.name;
                    });
                } catch (e) {
                    console.warn('Could not fetch group names:', e.message);
                }
                
                let successCount = 0;
                
                for (const groupId of groupIds) {
                    try {
                        await this.whatsappClient.sendMessage(groupId, message || '', mediaPath, caption || '');
                        
                        // Increment message count for each successful group send (only if userId is provided)
                        if (userId) {
                            await messageCountService.incrementCount(userId, 1);
                            console.log(`Incremented message count for user ${userId}: +1 message (scheduled group)`);
                            
                            // Use group name if available, otherwise use ID
                            const groupName = groupNamesMap[groupId] || groupId;
                            
                            // Log message to database
                            await messageLogService.logMessage(
                                userId,
                                'group',
                                groupName,
                                'sent',
                                message || '[Archivo multimedia]',
                                scheduledDate
                            );
                        } else {
                            console.warn('Cannot increment message count: userId is missing for scheduled group message');
                        }
                        successCount++;
                        
                        // Use group name if available, otherwise use ID
                        const groupName = groupNamesMap[groupId] || groupId;
                        
                        // Emit log event for each group with userId
                        if (this.io) {
                            this.io.emit('message_log', {
                                id: `scheduled-group-${jobId}-${groupId}`,
                                userId: userId || null,
                                target: groupName,
                                status: 'sent',
                                timestamp: new Date(),
                                content: message || '[Archivo multimedia]',
                                messageType: 'group' // Include message type
                            });
                        }
                    } catch (error) {
                        console.error(`Failed to send to group ${groupId}:`, error);
                        
                        // Use group name if available, otherwise use ID
                        const groupName = groupNamesMap[groupId] || groupId;
                        
                        // Log failed message to database (only if userId is provided)
                        if (userId) {
                            await messageLogService.logMessage(
                                userId,
                                'group',
                                groupName,
                                'failed',
                                message || '[Archivo multimedia]',
                                scheduledDate
                            );
                        }
                        
                        // Emit log event for failed group message with userId
                        if (this.io) {
                            this.io.emit('message_log', {
                                id: `scheduled-group-${jobId}-${groupId}`,
                                userId: userId || null,
                                target: groupName,
                                status: 'failed',
                                timestamp: new Date(),
                                content: message || '[Archivo multimedia]',
                                messageType: 'group' // Include message type
                            });
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to execute scheduled group messages:`, error);
            } finally {
                this.jobs.delete(jobId);
            }
        });

        if (job) {
            this.jobs.set(jobId, {
                type: 'group',
                count: groupIds.length,
                scheduledDate,
                job,
                userId,
                groupIds,
                message,
                mediaPath,
                caption
            });
            return jobId;
        }
        return null;
    }

    cancelJob(jobId, userId = null) {
        const jobData = this.jobs.get(jobId);
        if (jobData && jobData.job) {
            if (userId && jobData.userId && jobData.userId !== userId) {
                console.warn(`User ${userId} is not authorized to cancel job ${jobId} owned by ${jobData.userId}`);
                return false;
            }
            jobData.job.cancel();
            this.jobs.delete(jobId);
            return true;
        }
        return false;
    }

    rescheduleJob(jobId, newDate, userId = null) {
        const jobData = this.jobs.get(jobId);
        if (!jobData || !jobData.job) {
            return false;
        }
        if (userId && jobData.userId && jobData.userId !== userId) {
            console.warn(`User ${userId} is not authorized to reschedule job ${jobId} owned by ${jobData.userId}`);
            return false;
        }
        const ok = jobData.job.reschedule(newDate);
        if (ok) {
            jobData.scheduledDate = newDate;
            return true;
        }
        return false;
    }

    getJobs() {
        const jobsList = [];
        this.jobs.forEach((value, key) => {
            jobsList.push({
                id: key,
                type: value.type,
                scheduledDate: value.scheduledDate,
                details: value.to || `${value.count} recipients`,
                userId: value.userId || null
            });
        });
        return jobsList;
    }
}

export default MessageScheduler;
