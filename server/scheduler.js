import schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid';
import { userService, messageCountService, messageLogService } from './database.js';
import fs from 'fs';

class MessageScheduler {
    constructor(whatsappClient) {
        this.whatsappClient = whatsappClient;
        this.jobs = new Map();
        this.io = whatsappClient.io; // Access to socket.io for emitting events
    }

    // Helper for display formatting
    formatTarget(jid) {
        if (!jid) return 'Desconocido';
        return jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    }

    // Schedule a single message (mediaPath/caption pueden ser string o arrays)
    scheduleMessage(to, message, mediaPath, caption, scheduledDate, userId = null) {
        const jobId = uuidv4();
        console.log(`Scheduling message to ${to} at ${scheduledDate} for user ${userId}`);

        const job = schedule.scheduleJob(scheduledDate, async () => {
            try {
                console.log(`Executing scheduled message to ${to}`);
                const sessionManager = this.whatsappClient;
                const sessionId = sessionManager.getFirstActiveSession(userId);
                if (!sessionId) {
                    throw new Error('La sesión de WhatsApp no está lista o no existe (No active session found for user)');
                }
                await this.whatsappClient.sendMessage(sessionId, to, message || '', mediaPath, caption || '');
                console.log(`Scheduled message sent to ${to}`);

                const cleanTarget = this.formatTarget(to);
                // Increment message count (only if userId is provided)
                if (userId) {
                    await messageCountService.incrementCount(userId, 1);
                    console.log(`Incremented message count for user ${userId}: +1 message (scheduled)`);

                    // Log message to database
                    await messageLogService.logMessage(
                        userId,
                        'single',
                        cleanTarget,
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
                        target: cleanTarget,
                        status: 'sent',
                        timestamp: new Date(),
                        content: message || '[Archivo multimedia]',
                        messageType: 'single' // Include message type
                    });
                }
            } catch (error) {
                console.error(`Failed to send scheduled message to ${to}:`, error);
                const cleanTarget = this.formatTarget(to);

                // Log failed message to database (only if userId is provided)
                if (userId) {
                    await messageLogService.logMessage(
                        userId,
                        'single',
                        cleanTarget,
                        'failed',
                        message || '[Archivo multimedia]',
                        scheduledDate
                    );
                }

                // Emit log event for dashboard (failed)
                if (this.io) {
                    this.io.emit('message_log', {
                        id: `scheduled-${jobId}-failed`,
                        userId: userId || null,
                        target: cleanTarget,
                        status: 'failed',
                        timestamp: new Date(),
                        content: message || '[Archivo multimedia]',
                        messageType: 'single'
                    });
                }
            } finally {
                // Emit completion event so the UI can mark the card as sent/failed
                if (this.io) {
                    this.io.emit('job_completed', { jobId, userId });
                }
                // Clean up media files after sending (success or failure)
                const paths = Array.isArray(mediaPath) ? mediaPath : (mediaPath ? [mediaPath] : []);
                for (const p of paths) {
                    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
                }
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
                const sessionManager = this.whatsappClient;
                const sessionId = sessionManager.getFirstActiveSession(userId);

                if (!sessionId) {
                    throw new Error('La sesión de WhatsApp no está lista o no existe (No active session found for user)');
                }

                // sendBulkMessages already emits bulk_progress events, which are handled in App.tsx
                // Those events will automatically add logs to the dashboard
                // Assuming SessionManager.sendBulkMessages takes sessionId as first arg, similar to sendMessage
                // If not, we might need: sessionManager.sessions.get(sessionId).client.sendBulkMessages(...)
                // But let's try consistent signature first.
                // Actually, earlier logs showed WhatsAppClient.sendBulkMessages inside whatsapp.js.
                // If SessionManager wraps it, it likely needs sessionId.

                // If SessionManager has sendBulkMessages:
                if (typeof this.whatsappClient.sendBulkMessages === 'function') {
                    const results = await this.whatsappClient.sendBulkMessages(sessionId, contacts, message || '', mediaPath, caption || '', delay, userId, maxContactsPerBatch, waitTimeBetweenBatches);

                    // ... rest of logic
                    // Since I am replacing the whole block, I need to include the rest of the success/fail logic inside this try block

                    // Increment message count for successful sends (only if userId is provided)
                    if (userId) {
                        const successCount = results.filter(r => r.status === 'sent').length;
                        if (successCount > 0) {
                            await messageCountService.incrementCount(userId, successCount);
                            console.log(`Incremented message count for user ${userId}: +${successCount} messages (scheduled bulk)`);
                        }

                        // Log individual results to database
                        for (const result of results) {
                            const cleanTarget = this.formatTarget(result.contact);
                            await messageLogService.logMessage(
                                userId,
                                'bulk',
                                cleanTarget,
                                result.status === 'sent' ? 'sent' : 'failed',
                                message || '[Archivo multimedia]',
                                scheduledDate
                            );
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
                            status: successCount === contacts.length ? 'sent' : (successCount > 0 ? 'sent' : 'failed'),
                            timestamp: new Date(),
                            content: `Envío masivo programado completado (${successCount}/${contacts.length} mensajes)`,
                            messageType: 'bulk'
                        });
                    }
                } else {
                    throw new Error('sendBulkMessages method not found on SessionManager');
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
                // Emit completion event so the UI can mark the card as sent/failed
                if (this.io) {
                    this.io.emit('job_completed', { jobId, userId });
                }
                // Clean up media files after sending (success or failure)
                const paths = Array.isArray(mediaPath) ? mediaPath : (mediaPath ? [mediaPath] : []);
                for (const p of paths) {
                    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
                }
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
            let outerFailed = false;
            try {
                console.log(`Executing scheduled group messages`);

                // Normalize mediaPaths and captions to arrays
                const mediaPaths = Array.isArray(mediaPath) ? mediaPath : (mediaPath ? [mediaPath] : []);
                const mediaCaptions = Array.isArray(caption) ? caption : (caption ? [caption] : mediaPaths.map(() => ''));

                const sessionManager = this.whatsappClient;
                const sessionId = sessionManager.getFirstActiveSession(userId);
                if (!sessionId) {
                    throw new Error('La sesión de WhatsApp no está lista o no existe (No active session found for user)');
                }

                // Get group names for better logging
                let groupNamesMap = {};
                try {
                    const groups = await sessionManager.getGroups(sessionId);
                    groups.forEach(group => {
                        groupNamesMap[group.id] = group.name;
                    });
                } catch (e) {
                    console.warn('Could not fetch group names:', e.message);
                }

                let successCount = 0;
                let failedCount = 0;
                const totalGroups = groupIds.length;

                for (let i = 0; i < groupIds.length; i++) {
                    const groupId = groupIds[i];
                    const groupName = groupNamesMap[groupId] || groupId;
                    try {
                        // Send all media in one call (array of paths + captions)
                        await sessionManager.sendMessage(sessionId, groupId, message || '', mediaPaths.length > 0 ? mediaPaths : null, mediaCaptions);

                        successCount++;

                        if (userId) {
                            await messageCountService.incrementCount(userId, 1);
                            console.log(`Incremented message count for user ${userId}: +1 message (scheduled group)`);
                            await messageLogService.logMessage(userId, 'group', groupName, 'sent', message || '[Archivo multimedia]', scheduledDate);
                        }

                        if (this.io) {
                            this.io.emit('message_log', {
                                id: `scheduled-group-${jobId}-${groupId}`,
                                userId: userId || null,
                                target: groupName,
                                status: 'sent',
                                timestamp: new Date(),
                                content: message || '[Archivo multimedia]',
                                messageType: 'group'
                            });
                            // Emit progress so the UI queue bar shows up
                            this.io.emit('group_progress', {
                                userId,
                                current: i + 1,
                                total: totalGroups,
                                successCount,
                                failedCount,
                                groupId,
                                status: 'sent'
                            });
                        }
                    } catch (error) {
                        failedCount++;
                        console.error(`Failed to send to group ${groupId}:`, error);

                        if (userId) {
                            await messageLogService.logMessage(userId, 'group', groupName, 'failed', message || '[Archivo multimedia]', scheduledDate);
                        }

                        if (this.io) {
                            this.io.emit('message_log', {
                                id: `scheduled-group-${jobId}-${groupId}`,
                                userId: userId || null,
                                target: groupName,
                                status: 'failed',
                                timestamp: new Date(),
                                content: message || '[Archivo multimedia]',
                                messageType: 'group'
                            });
                            this.io.emit('group_progress', {
                                userId,
                                current: i + 1,
                                total: totalGroups,
                                successCount,
                                failedCount,
                                groupId,
                                status: 'failed',
                                error: error.message
                            });
                        }
                    }
                    if (i < groupIds.length - 1) await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to execute scheduled group messages:`, error);
                outerFailed = true;
            } finally {
                // Emit completion event so the UI can mark the card as sent/failed
                if (this.io) {
                    this.io.emit('job_completed', { jobId, userId, status: outerFailed ? 'failed' : 'sent' });
                }
                // Clean up media files after sending (success or failure)
                const paths = Array.isArray(mediaPath) ? mediaPath : (mediaPath ? [mediaPath] : []);
                for (const p of paths) {
                    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
                }
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

    cancelJob(jobId, userId = null, keepMedia = false) {
        const jobData = this.jobs.get(jobId);
        if (jobData && jobData.job) {
            if (userId && jobData.userId && jobData.userId !== userId) {
                console.warn(`User ${userId} is not authorized to cancel job ${jobId} owned by ${jobData.userId}`);
                return false;
            }
            jobData.job.cancel();
            // Only clean up media files if keepMedia is false
            if (!keepMedia) {
                const paths = Array.isArray(jobData.mediaPath) ? jobData.mediaPath : (jobData.mediaPath ? [jobData.mediaPath] : []);
                for (const p of paths) {
                    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
                }
            }
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
            // Normalize mediaPaths and captions arrays
            const mediaPaths = Array.isArray(value.mediaPath)
                ? value.mediaPath
                : (value.mediaPath ? [value.mediaPath] : []);
            const captions = Array.isArray(value.caption)
                ? value.caption
                : (value.caption ? [value.caption] : mediaPaths.map(() => ''));

            jobsList.push({
                id: key,
                type: value.type,
                scheduledDate: value.scheduledDate,
                details: value.to || `${value.count} recipients`,
                userId: value.userId || null,
                mediaPaths,
                captions,
                message: value.message || ''
            });
        });
        return jobsList;
    }
}

export default MessageScheduler;
