import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/api/mappers.dart';

void main() {
  test('a message the server masked is marked hidden; others are not', () {
    final hidden = ApiMap.message({'id': 'm1', 'fromMe': true, 'kind': 'text', 'text': 'whatsapp me ****', 'meta': {'hidden': true}, 'at': '2026-11-05T10:00:00Z'});
    expect(hidden.text, 'whatsapp me ****');
    expect(hidden.hidden, isTrue);
    final plain = ApiMap.message({'id': 'm2', 'fromMe': true, 'kind': 'text', 'text': 'hi', 'at': '2026-11-05T10:00:00Z'});
    expect(plain.hidden, isFalse);
    final photo = ApiMap.message({'id': 'm3', 'fromMe': true, 'kind': 'photo', 'text': '', 'meta': {'url': 'x', 'hidden': true}, 'at': '2026-11-05T10:00:00Z'});
    expect(photo.hidden, isFalse, reason: 'only text can be masked');
  });
}
