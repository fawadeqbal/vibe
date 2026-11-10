part of 'activity_provider.dart';

/// The offline mock: one line of each kind, each opening its own page.
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
        id: 'demo-missed',
        type: 'call.missed',
        title: 'Missed video call',
        body: 'From Bilal. Tap to call back.',
        data: const {'route': 'chat', 'open': 'calls', 'userId': 'demo-bilal', 'friendId': 'demo-bilal'},
        at: now.subtract(const Duration(minutes: 55)),
        actor: const Profile(id: 'demo-bilal', name: 'Bilal', age: 25, gender: Gender.male, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '', bio: '', interests: []),
        rel: const ActivityRel(friend: FriendState.friends),
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
      ActivityItem(
        id: 'demo-warning',
        type: 'account.warning',
        title: 'A note from the Vibe team',
        body: 'One of your Moments was removed because it showed nudity, which isn’t allowed on Vibe.',
        data: const {'route': 'inbox', 'open': 'account'},
        at: now.subtract(const Duration(days: 2)),
        read: true,
      ),
      ActivityItem(
        id: 'demo-cashout',
        type: 'cashout.update',
        title: 'Cash-out sent 💸',
        body: 'Your money is on its way to your account.',
        data: const {'route': 'wallet', 'open': 'cashout', 'cashoutId': 'demo-cashout'},
        at: now.subtract(const Duration(days: 8)),
        read: true,
      ),
      ActivityItem(
        id: 'demo-team',
        type: 'team.message',
        title: 'Vibe Hour, every night at 9',
        body: 'For one hour every night, filters are free and every call earns double XP.',
        data: const {'route': 'inbox', 'open': 'team', 'messageId': 'demo-team'},
        at: now.subtract(const Duration(days: 12)),
        read: true,
      ),
    ];
    _unread = 1;
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<Cashout?> cashout(String id) async => id == 'demo-cashout'
      ? Cashout(
          id: id,
          gems: 9000,
          usd: 16,
          amountPkr: 4500,
          method: PaymentMethod.easypaisa,
          accountMasked: '••1234',
          status: CashoutStatus.paid,
          createdAt: DateTime.now().subtract(const Duration(days: 8)),
          processedAt: DateTime.now().subtract(const Duration(days: 7)),
        )
      : null;

  @override
  Future<AccountStatus> accountStatus() async => AccountStatus(
    notes: [
      AccountNote(
        id: 'demo-warning',
        type: 'account.warning',
        title: 'A note from the Vibe team',
        body: 'One of your Moments was removed because it showed nudity, which isn’t allowed on Vibe.',
        at: DateTime.now().subtract(const Duration(days: 2)),
      ),
    ],
  );

  @override
  Future<TeamMessage?> teamMessage(String id) async => id == 'demo-team'
      ? TeamMessage(
          id: id,
          title: 'Vibe Hour, every night at 9',
          body: 'For one hour every night, filters are free and every call earns double XP.',
          at: DateTime.now().subtract(const Duration(days: 12)),
        )
      : null;

  @override
  Future<CallHistory?> callHistory(String userId) async => CallHistory(
    streak: 3,
    calls: [
      CallLogEntry(id: 'c1', kind: CallLogKind.missed, video: true, outgoing: false, at: DateTime.now().subtract(const Duration(hours: 1))),
      CallLogEntry(id: 'c2', kind: CallLogKind.ended, video: true, seconds: 840, at: DateTime.now().subtract(const Duration(days: 2))),
    ],
  );

  @override
  Future<void> markAllRead() async {
    if (_unread == 0) return;
    _unread = 0;
    notifyListeners();
  }
}
