import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/mock/mock_data.dart';
import '../../core/theme/intent_icons.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/data/countries.dart' show defaultCountryCode;
import '../../core/theme/vibe_dropdown.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/session_provider.dart';
import '../../services/app_services.dart';
import '../../services/invite/invite_capture.dart';
import '../invite/invite_banner.dart';
import '../invite/invite_code_field.dart';

/// Name, age, gender, country, a few interests. Age gates 18+. The photo is
/// taken or picked with image_picker and uploaded (`POST /me/avatar`).
class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key, this.editing = false});
  final bool editing;

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  late final TextEditingController _name;
  late final TextEditingController _bio;
  late int _age;
  late Gender _gender;
  late Country _country;
  late Set<String> _interests;
  ProfileIntent? _intent;
  late String _avatar;
  int _avatarSeed = 0;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final me = context.read<SessionProvider>().me;
    _name = TextEditingController(text: me?.name ?? '');
    _bio = TextEditingController(text: me?.bio ?? '');
    _age = me == null || me.age < 18 ? 21 : me.age;
    _gender = me?.gender ?? Gender.other;
    _country = me?.country ?? MockData.country('PK');
    _interests = {...?me?.interests};
    _intent = me?.intent;
    _avatar = me?.avatarUrl ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.length < 2) {
      setState(() => _error = 'Tell us what to call you.');
      return;
    }
    if (_age < 18) {
      setState(() => _error = 'Vibe is for adults only.');
      return;
    }
    setState(() {
      _error = null;
      _saving = true;
    });
    final session = context.read<SessionProvider>();
    final me = session.me!;
    try {
      await session.saveProfile(me.copyWith(name: name, age: _age, gender: _gender, country: _country, bio: _bio.text.trim(), interests: _interests.toList(), avatarUrl: _avatar, intent: _intent, clearIntent: _intent == null));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    if (!mounted) return;
    setState(() => _saving = false);
    if (widget.editing) Navigator.of(context).pop(true);
  }

  bool _uploading = false;

  InviteCapture? get _invites => context.read<SessionProvider>().invites;

  /// Camera or gallery → resized on the device → uploaded right away (the
  /// server stores it and returns the URL). Without a picker (desktop,
  /// tests) the demo cycles stock portraits.
  Future<void> _newPhoto() async {
    final media = context.read<AppServices>().media;
    if (!media.available) {
      _avatarSeed = (_avatarSeed + 1) % 70;
      setState(() => _avatar = 'https://i.pravatar.cc/400?img=${_avatarSeed + 1}');
      return;
    }
    final camera = await showVibeSheet<bool>(
      context,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(leading: const Icon(SolarIconsBold.camera, color: V.text), title: Text('Take a photo', style: VT.body(15)), onTap: () => Navigator.of(context).pop(true)),
          ListTile(leading: const Icon(SolarIconsBold.galleryWide, color: V.text), title: Text('Choose from gallery', style: VT.body(15)), onTap: () => Navigator.of(context).pop(false)),
          const SizedBox(height: 8),
        ],
      ),
    );
    if (camera == null || !mounted) return;
    final session = context.read<SessionProvider>();
    try {
      final photo = await media.pickPhoto(camera: camera);
      if (photo == null || !mounted) return;
      setState(() => _uploading = true);
      await session.uploadAvatar(photo.bytes, contentType: photo.contentType);
      if (mounted) setState(() => _avatar = session.me?.avatarUrl ?? _avatar);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } on FormatException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } catch (_) {
      if (mounted) toast(context, "Couldn't open the camera or gallery. Check Vibe's permissions.", error: true);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.editing ? vibeAppBar(context, 'Edit profile') : null,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          children: [
            if (!widget.editing) ...[
              const Headline('Set up your ', accent: 'profile', size: 34, accentColor: V.pinkSoft),
              const SizedBox(height: 10),
              Text('This is what people see for the first three seconds. Make it count.', style: VT.body(15, color: V.text2, height: 1.5)),
              Builder(builder: (context) {
                final by = context.select<SessionProvider, InvitedBy?>((s) => s.invitedBy);
                if (by == null) return const SizedBox.shrink();
                return Padding(padding: const EdgeInsets.only(top: 16), child: InviteBannerRow(name: by.name, coins: Economy.inviteeRewardCoins));
              }),
              const SizedBox(height: 24),
            ],
            Center(
              child: GestureDetector(
                onTap: _uploading ? null : _newPhoto,
                child: Stack(
                  children: [
                    VAvatar(url: _avatar, name: _name.text, size: 112, ring: true),
                    if (_uploading) const Positioned.fill(child: Center(child: CircularProgressIndicator(color: V.pink))),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: V.surface3, border: Border.all(color: V.bg, width: 3)),
                        child: const Icon(SolarIconsBold.camera, size: 16, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            Center(child: Text(context.read<AppServices>().media.available ? 'Tap to change photo' : 'Tap to change photo (demo portraits)', style: VT.body(12, color: V.muted))),
            const SizedBox(height: 24),
            _label('Name'),
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(hintText: 'What should people call you?'), onChanged: (_) => setState(() {})),
            const SizedBox(height: 18),
            _label('Age'),
            Row(
              children: [
                _stepper(Icons.remove_rounded, () => setState(() => _age = (_age - 1).clamp(13, 99))),
                Expanded(child: Center(child: Text('$_age', style: VT.display(28, color: _age < 18 ? V.bad : V.text)))),
                _stepper(Icons.add_rounded, () => setState(() => _age = (_age + 1).clamp(13, 99))),
              ],
            ),
            if (_age < 18) Padding(padding: const EdgeInsets.only(top: 6), child: Text('You need to be 18 or older to use Vibe.', style: VT.body(13, color: V.bad))),
            const SizedBox(height: 18),
            _label('I am'),
            Row(
              children: [
                for (final g in Gender.values) ...[
                  Expanded(child: _choice(g.label, _gender == g, () => setState(() => _gender = g))),
                  if (g != Gender.values.last) const SizedBox(width: 8),
                ],
              ],
            ),
            const SizedBox(height: 18),
            _label('Country'),
            VibeDropdown(
              label: 'Country',
              value: _country.code,
              options: countryOptions(),
              suggested: const [defaultCountryCode],
              searchPlaceholder: 'Search countries',
              onChanged: (v) => setState(() => _country = MockData.country(v)),
            ),
            const SizedBox(height: 18),
            _label('About you'),
            TextField(
              controller: _bio,
              maxLines: 2,
              maxLength: 120,
              decoration: const InputDecoration(hintText: 'One line people see before the call. e.g. Cricket fan, bad at cooking, good at listening.'),
            ),
            const SizedBox(height: 8),
            _label('Here for (optional)'),
            LayoutBuilder(
              builder: (context, box) {
                final w = (box.maxWidth - 8) / 2;
                return Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final i in ProfileIntent.values) SizedBox(width: w, child: _intentTile(i)),
                  ],
                );
              },
            ),
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.only(left: 2),
              child: Text("Shown on your profile. It doesn't change who you're matched with.", style: VT.body(11.5, color: V.muted)),
            ),
            const SizedBox(height: 18),
            _label('Interests (pick 3 or more)'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final i in MockData.interests)
                  _chip(i, _interests.contains(i), () => setState(() => _interests.contains(i) ? _interests.remove(i) : _interests.add(i))),
              ],
            ),
            if (!widget.editing) ...[
              const SizedBox(height: 18),
              // Sign-up couldn't use a code (or none was captured): 48 h to add one.
              InviteCodeField(initialCode: _invites?.lastUsedCode),
            ],
            if (_error != null) ...[const SizedBox(height: 12), Text(_error!, style: VT.body(13, color: V.bad))],
            const SizedBox(height: 28),
            GradientButton(label: widget.editing ? 'Save' : 'Continue', onTap: _save, busy: _saving),
          ],
        ),
      ),
    );
  }

  /// One "Here for" choice: icon and label over a short line. Tap again to clear.
  Widget _intentTile(ProfileIntent i) {
    final on = _intent == i;
    return Semantics(
      button: true,
      selected: on,
      child: GestureDetector(
        onTap: () => setState(() => _intent = on ? null : i),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: on ? V.surfaceSel : V.surface2,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: on ? V.pink : V.lineSoft, width: on ? 1.5 : 1),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Icon(intentIcon(i), size: 18, color: on ? V.pinkSoft : V.text2),
                  const SizedBox(width: 8),
                  Flexible(child: Text(i.label, style: VT.title(14, weight: FontWeight.w600, color: on ? V.text : V.text2))),
                ],
              ),
              const SizedBox(height: 2),
              Text(i.blurb, style: VT.body(11.5, color: V.muted, height: 1.3)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String t) => Padding(padding: const EdgeInsets.only(bottom: 10, left: 2), child: Text(t.toUpperCase(), style: VT.overline()));

  Widget _stepper(IconData icon, VoidCallback onTap) {
    return Material(
      color: V.surface2,
      shape: const CircleBorder(),
      child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: SizedBox(width: 48, height: 48, child: Icon(icon, color: V.text))),
    );
  }

  Widget _choice(String label, bool on, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        height: 46,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? V.surfaceSel : V.surface2,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: on ? V.pink : V.lineSoft, width: on ? 1.5 : 1),
        ),
        child: Text(label, style: VT.title(14, weight: FontWeight.w600, color: on ? V.text : V.text2)),
      ),
    );
  }

  Widget _chip(String label, bool on, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? V.pink.withValues(alpha: 0.14) : V.surface2,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: on ? V.pink.withValues(alpha: 0.6) : V.lineSoft),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (on) ...[const Icon(Icons.check_rounded, size: 14, color: V.pinkSoft), const SizedBox(width: 4)],
            Text(label, style: VT.label(13, color: on ? V.pinkSoft : V.text2)),
          ],
        ),
      ),
    );
  }
}
