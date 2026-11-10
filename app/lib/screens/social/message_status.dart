import 'package:flutter/material.dart';

import '../../core/theme/vibe_theme.dart';
import '../../models/models.dart';

/// The ticks on your own messages, like WhatsApp: sending (a clock) → sent
/// (one grey tick: Vibe has it) → delivered (two grey ticks: it reached
/// their phone or an open tab) → seen (two teal ticks). `failed`: couldn't
/// be sent (a red !). Same as the web (`message-status.ts`).
enum MessageStatus { sending, sent, delivered, seen, failed }

/// [seenAt] / [deliveredAt]: live receipts for the whole chat (everything sent up to then). Null for theirs.
MessageStatus? messageStatus(ChatMessage m, {DateTime? seenAt, DateTime? deliveredAt}) {
  if (!m.fromMe || m.isSystem || m.unsent) return null;
  if (m.failed) return MessageStatus.failed;
  if (m.pending) return MessageStatus.sending;
  if (m.readAt != null || (seenAt != null && !seenAt.isBefore(m.at))) return MessageStatus.seen;
  if (m.deliveredAt != null || (deliveredAt != null && !deliveredAt.isBefore(m.at))) return MessageStatus.delivered;
  return MessageStatus.sent;
}

/// When it was sent, delivered and seen, for Hold › Info (null where it hasn't happened).
({DateTime sent, DateTime? delivered, DateTime? seen}) statusTimes(ChatMessage m, {DateTime? seenAt, DateTime? deliveredAt}) {
  final seen = m.readAt ?? (seenAt != null && !seenAt.isBefore(m.at) ? seenAt : null);
  final delivered = m.deliveredAt ?? (deliveredAt != null && !deliveredAt.isBefore(m.at) ? deliveredAt : null) ?? seen;
  return (sent: m.at, delivered: delivered, seen: seen);
}

/// The ticks themselves. [onMine]: inside your violet bubble (lighter grey).
class Ticks extends StatelessWidget {
  const Ticks(this.status, {super.key, this.onMine = false});
  final MessageStatus status;
  final bool onMine;

  static const _labels = {
    MessageStatus.sending: 'Sending',
    MessageStatus.sent: 'Sent',
    MessageStatus.delivered: 'Delivered',
    MessageStatus.seen: 'Seen',
    MessageStatus.failed: 'Not sent',
  };

  @override
  Widget build(BuildContext context) {
    final grey = onMine ? Colors.white.withValues(alpha: 0.65) : V.muted;
    final color = switch (status) {
      MessageStatus.seen => onMine ? const Color(0xFF99F6E4) : V.trust,
      MessageStatus.failed => onMine ? const Color(0xFFFECDD3) : V.bad,
      _ => grey,
    };
    final icon = switch (status) {
      MessageStatus.sending => Icons.schedule_rounded,
      MessageStatus.failed => Icons.error_outline_rounded,
      MessageStatus.sent => Icons.done_rounded,
      _ => Icons.done_all_rounded,
    };
    return Icon(icon, size: status == MessageStatus.sending || status == MessageStatus.failed ? 13 : 16, color: color, semanticLabel: _labels[status]);
  }
}
