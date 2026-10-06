import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_config.dart';
import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/referrals_provider.dart';
import '../../providers/session_provider.dart';
import '../../services/app_services.dart';
import '../partner/partner_screen.dart';

/// Your invite link with a channel (`?s=whatsapp`): the server's once the
/// Invite screen has loaded, else built from your code (server mode) or
/// the demo code (offline).
String inviteLinkFor(BuildContext context, {String? channel}) {
  final referrals = context.read<ReferralsProvider>();
  final fromServer = referrals.link(channel: channel);
  if (fromServer != null) return fromServer;
  final code = context.read<SessionProvider>().inviteCode ?? (referrals.isRemote ? null : MockData.myInviteCode);
  final base = code == null ? ApiConfig.siteUrl : ApiConfig.inviteLink(code);
  return code == null ? base : inviteLinkWithChannel(base, channel);
}

/// The message that goes with an invite.
String inviteMessage(String link, {int? coins}) {
  final c = coins ?? Economy.inviteeRewardCoins;
  return 'Come vibe with me 👋 Meet new people on video — sign up with my link and get $c free coins: $link';
}

/// WhatsApp first; falls back to the system share sheet, then the clipboard.
Future<void> shareInviteOnWhatsApp(BuildContext context, {int? coins}) async {
  final share = context.read<AppServices>().share;
  final text = inviteMessage(inviteLinkFor(context, channel: 'whatsapp'), coins: coins);
  if (await share.whatsApp(text)) return;
  if (!context.mounted) return;
  if (await share.shareText(text)) return;
  if (context.mounted) await copyInvite(context, text: text);
}

/// The system share sheet with the invite text.
Future<void> shareInviteText(BuildContext context, {int? coins}) async {
  final share = context.read<AppServices>().share;
  final text = inviteMessage(inviteLinkFor(context, channel: 'share'), coins: coins);
  if (await share.shareText(text)) return;
  if (context.mounted) await copyInvite(context, text: text);
}

/// Copies the link (or [text]) and says so.
Future<void> copyInvite(BuildContext context, {String? text}) async {
  await Clipboard.setData(ClipboardData(text: text ?? inviteLinkFor(context, channel: 'copy')));
  if (context.mounted) toast(context, text == null ? 'Invite link copied' : 'Invite copied — paste it anywhere');
}

/// Me → "Creator partner program", and the `partner` push: the native
/// partner screen (kept under this name for older call sites; new code
/// calls [openPartnerScreen]).
Future<void> openPartnerPage(BuildContext context) async => openPartnerScreen(context);
