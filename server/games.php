<?php
declare(strict_types=1);

header('Content-Type: application/json');
$storage = __DIR__ . '/storage';
if (!is_dir($storage)) { mkdir($storage, 0775, true); }
$method = $_SERVER['REQUEST_METHOD'];
$name = basename((string)($_GET['file'] ?? $_GET['name'] ?? ''));

if ($method === 'GET' && $name === '') {
    $games = array_map(static function (string $path): array {
        $file = basename($path);
        $body = json_decode((string)file_get_contents($path), true);
        $readableName = is_array($body) && isset($body['name']) && trim((string)$body['name']) !== ''
            ? trim((string)$body['name'])
            : $file;
        return ['file' => $file, 'name' => $readableName];
    }, glob($storage . '/*.json') ?: []);
    echo json_encode(['games' => $games]); exit;
}
if ($method === 'POST' && $name === '') {
    $name = date('Ymd_His');
    while (is_file($storage . '/' . $name . '.json')) {
        $name = date('Ymd_His') . '_' . bin2hex(random_bytes(2));
    }
}
if ($name === '' || !preg_match('/^[a-zA-Z0-9_-]+(?:\.json)?$/', $name)) {
    http_response_code(400); echo json_encode(['error' => 'A valid file name is required']); exit;
}
$file = $storage . '/' . preg_replace('/\.json$/', '', $name) . '.json';
if ($method === 'GET') {
    if (!is_file($file)) { http_response_code(404); echo json_encode(['error' => 'Game not found']); exit; }
    readfile($file); exit;
}
if ($method === 'DELETE') {
    if (is_file($file)) { unlink($file); }
    http_response_code(204); exit;
}
if ($method === 'POST' || $method === 'PUT') {
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) { http_response_code(422); echo json_encode(['error' => 'Invalid JSON']); exit; }
    file_put_contents($file, json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    http_response_code($method === 'POST' ? 201 : 200);
    echo json_encode(['file' => basename($file)]); exit;
}
http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
