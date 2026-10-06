const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@exemplo.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

exports.notifyNewAppointment = onDocumentCreated(
  'users/{uid}/appointments/{apptId}',
  async (event) => {
    const ap = event.data && event.data.data();
    if (!ap) return;
    if (ap.requested !== true || ap.status === 'cancelled') return;
    if (!VAPID_PRIVATE) {
      console.warn('VAPID nao configurado — push ignorado.');
      return;
    }

    const uid = event.params.uid;
    let subsSnap;
    try {
      subsSnap = await admin.firestore()
        .collection('users').doc(uid).collection('pushSubs').get();
    } catch (e) {
      console.error('Falha ao ler pushSubs:', e);
      return;
    }
    if (subsSnap.empty) return;

    const d = String(ap.date || '');
    const body = `${ap.client || 'Cliente'} — ${d.slice(8, 10)}/${d.slice(5, 7)} às ${ap.time || ''}`
      + (ap.servico ? ` · ${ap.servico}` : '')
      + (ap.barbeiro ? ` · ${ap.barbeiro}` : '');
    const payload = JSON.stringify({
      title: 'Novo Agendamento',
      body,
      url: '/',
      tag: 'new-appt'
    });

    const results = await Promise.allSettled(
      subsSnap.docs.map(async (d) => {
        const s = d.data();
        if (!s || !s.endpoint || !s.keys) return;
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys },
            payload
          );
        } catch (err) {
          const code = err && err.statusCode;
          if (code === 404 || code === 410) {
            await d.ref.delete().catch(() => {});
          } else {
            console.warn('push falhou:', code || (err && err.message));
          }
        }
      })
    );
    console.log('push enviado para', results.length, 'aparelho(s)');
  }
);

const SUB_MEMBERS_BASE = 'memberships';
const REMINDER_BASE = 'reminders';

exports.processSubReminders = onSchedule('0 8 * * *', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(200).send('OK');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).send('Método não permitido');
    return;
  }

  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

  console.log('processSubReminders — hoje:', todayStr);

  let remindersWritten = 0;
  const processed = new Set();

  const usersSnap = await admin.firestore().collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    try {
      const settingsSnap = await userDoc.ref.collection('subscription').doc('settings').get();
      const pushEnabled = settingsSnap.exists() && settingsSnap.data().pushEnabled === true;
      const memSnap = await userDoc.ref.collection(SUB_MEMBERS_BASE)
        .where('nextDueDate', '==', todayStr)
        .get();
      if (memSnap.empty) continue;

      const existing = await userDoc.ref.collection('subscription').doc(REMINDER_BASE).collection(todayStr).get();

      for (const mDoc of memSnap.docs) {
        const m = mDoc.data();
        const key = `${uid}|${m.clientUid}`;
        if (processed.has(key)) continue;
        if (existing.docs.some(d => d.id === mDoc.id)) continue;

        processed.add(key);

        const clientPhone = String(m.clientPhone || '').replace(/\D/g,'').slice(0,11);
        const clientName = String(m.clientName || '').trim() || 'Cliente';
        const planName = String(m.planName || '').trim();
        const status = m.status || 'pending_payment';
        const message = `Olá ${clientName}! Seu plano "${planName}" vence hoje (${todayStr}). Para manter seus cortes, envie o comprovante do PIX para liberarmos seu próximo uso. Obrigado! 💈`;
        const encoded = encodeURIComponent(message);
        const waUrl = clientPhone ? 'https://wa.me/55' + clientPhone + '?text=' + encoded : null;

        await userDoc.ref.collection('subscription').doc(REMINDER_BASE).collection(todayStr).doc(mDoc.id).set({
          clientUid: m.clientUid,
          clientName,
          clientPhone,
          planName,
          status,
          dueDate: todayStr,
          waUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sentPush: false
        }, { merge: true });

        remindersWritten++;

        if (pushEnabled && VAPID_PRIVATE && clientPhone && waUrl) {
          try {
            const subsSnap = await admin.firestore().collection('users').doc(m.clientUid).collection('pushSubs').get();
            if (!subsSnap.empty) {
              const payload = JSON.stringify({
                title: status === 'active' ? 'Renovação do plano 💳' : 'Pagamento do plano 💳',
                body: status === 'active'
                  ? `Seu plano "${planName}" vence hoje (${todayStr}).`
                  : `Seu pagamento do plano "${planName}" vence hoje (${todayStr}).`,
                tag: 'sub-reminder'
              });
              await Promise.allSettled(
                subsSnap.docs.map(async (s) => {
                  const d = s.data();
                  if (!d.endpoint || !d.keys) return;
                  try {
                    await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, payload);
                  } catch (err) {
                    const code = err && err.statusCode;
                    if (code === 404 || code === 410) {
                      s.ref.delete().catch(() => {});
                    } else {
                      console.warn('push sub falhou:', code || (err && err.message));
                    }
                  }
                })
              );
            }
          } catch (e) {
            console.warn('push sub falhou:', e.message);
          }
        }
      }
    } catch (e) {
      console.error(`falha ao processar lembretes de ${uid}:`, e.message);
    }
  }
  console.log('lembretes escritos:', remindersWritten);
  res.json({ ok: true, today: todayStr, remindersWritten });
});

const OPERATOR_UID = 'pED3xfZrvdQwngJXUOeXqIl4G462';

exports.manageBarberAuth = onCall({ cors: true }, async (request) => {
  if (!request.auth || request.auth.uid !== OPERATOR_UID) {
    throw new HttpsError('permission-denied', 'Sem permissão para gerenciar contas.');
  }
  const data = request.data || {};
  const email = String(data.email || '').toLowerCase().trim();
  const password = String(data.password || '');
  const action = String(data.action || 'create');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new HttpsError('invalid-argument', 'E-mail inválido.');
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'A senha precisa de ao menos 6 caracteres.');
  }
  if (action !== 'create' && action !== 'setPassword') {
    throw new HttpsError('invalid-argument', 'Ação inválida.');
  }

  try {
    if (action === 'create') {
      try {
        await admin.auth().createUser({ email, password });
        return { ok: true, existed: false };
      } catch (e) {
        if (e && e.code === 'auth/email-already-exists') {
          const u = await admin.auth().getUserByEmail(email);
          await admin.auth().updateUser(u.uid, { password });
          return { ok: true, existed: true };
        }
        throw e;
      }
    }
    let u;
    try {
      u = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (e && e.code === 'auth/user-not-found') {
        throw new HttpsError('not-found', 'Conta de login não encontrada para este e-mail.');
      }
      throw e;
    }
    await admin.auth().updateUser(u.uid, { password });
    return { ok: true, existed: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const code = e && e.code;
    if (code === 'auth/weak-password') {
      throw new HttpsError('invalid-argument', 'Senha muito fraca (mín. 6 caracteres).');
    }
    console.warn('manageBarberAuth:', code || (e && e.message));
    throw new HttpsError('internal', 'Não foi possível configurar o acesso.');
  }
});
