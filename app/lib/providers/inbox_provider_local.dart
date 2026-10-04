part of 'inbox_provider.dart';

/// The offline mock: one welcome note from the team.
class LocalInboxProvider extends InboxProvider {
  LocalInboxProvider() : super.base();

  @override
  Future<void> load() async {
    if (_loaded) return;
    _items = [
      TeamMessage(
        id: 'welcome',
        title: 'Welcome to Vibe',
        body: "Hi there,\n\nThanks for joining. Be kind, keep it safe, and tap Report if anyone makes you uncomfortable — we look at every report.\n\nHave fun meeting people!",
        at: DateTime.now().subtract(const Duration(minutes: 5)),
      ),
    ];
    _unread = 1;
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<void> markRead(String id) async => _setRead(id);

  @override
  Future<void> markAllRead() async => _setAllRead();
}
