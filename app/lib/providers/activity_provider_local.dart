part of 'activity_provider.dart';

/// The offline mock: a friend request and a payment, so the page isn't empty.
class LocalActivityProvider extends ActivityProvider {
  LocalActivityProvider() : super.base();

  @override
  Future<void> load() async {
    if (_loaded) return;
    final now = DateTime.now();
    _items = [
      ActivityItem(
        id: 'demo-follow',
        type: 'follow.new',
        title: 'New follower',
        body: 'Sana started following you',
        data: const {'route': 'profile', 'userId': 'demo-sana'},
        at: now.subtract(const Duration(minutes: 12)),
        actor: const Profile(id: 'demo-sana', name: 'Sana', age: 23, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '', bio: '', interests: []),
        rel: const ActivityRel(followsYou: true),
      ),
      ActivityItem(
        id: 'demo-coins',
        type: 'payment.update',
        title: 'Payment received',
        body: 'Your coins are in your wallet.',
        data: const {'route': 'wallet'},
        at: now.subtract(const Duration(days: 1)),
        read: true,
      ),
    ];
    _unread = 1;
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<void> markAllRead() async {
    if (_unread == 0) return;
    _unread = 0;
    notifyListeners();
  }
}
