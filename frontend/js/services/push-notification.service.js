/**
 * PLANİGO — Firebase Push Notification Service
 * Sadece native Capacitor app'te çalışır (web'de no-op).
 */

export async function initPushNotifications(authToken) {
    if (!window.Capacitor?.isNativePlatform()) return;

    const { PushNotifications } = await import('@capacitor/push-notifications');

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') return;

    await PushNotifications.register();

    // FCM token alındığında backend'e kaydet
    PushNotifications.addListener('registration', async ({ value: fcmToken }) => {
        try {
            await fetch('/api/v1/auth/fcm-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ fcm_token: fcmToken }),
            });
        } catch (e) {
            console.warn('[Push] Token kaydedilemedi:', e);
        }
    });

    // Uygulama açıkken gelen bildirim
    PushNotifications.addListener('pushNotificationReceived', notification => {
        console.log('[Push] Foreground:', notification.title);
    });

    // Bildirime tıklandığında ilgili plan detayına git
    PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const planId = action.notification.data?.plan_id;
        if (planId) window.navigateToPlan?.(planId);
    });
}
