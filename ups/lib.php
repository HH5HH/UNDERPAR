<?php

declare(strict_types=1);

const UNDERPAR_IBETA_RETENTION_SECONDS = 60 * 60 * 24 * 7;
const UNDERPAR_IBETA_MAX_BODY_BYTES = 2_500_000;

function underpar_ibeta_send_cors_headers(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    header('Access-Control-Max-Age: 86400');
}

function underpar_ibeta_storage_dir(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'data';
}

function underpar_ibeta_public_base_url(): string
{
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off');
    $scheme = $https ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '/ups/index.php');
    $directory = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
    $directory = $directory === '' ? '/' : $directory . '/';
    return sprintf('%s://%s%s', $scheme, $host, $directory);
}

function underpar_ibeta_debug_meta(array $record = [], string $id = ''): array
{
    $snapshot = is_array($record['snapshot'] ?? null) ? $record['snapshot'] : [];
    $table = is_array($snapshot['table'] ?? null) ? $snapshot['table'] : [];
    $rowCount = (int) ($table['rowCount'] ?? 0);
    if ($rowCount <= 0 && is_array($snapshot['cards'] ?? null)) {
        foreach ($snapshot['cards'] as $card) {
            if (!is_array($card)) {
                continue;
            }
            $cardTable = is_array($card['table'] ?? null) ? $card['table'] : [];
            $rowCount += (int) ($cardTable['rowCount'] ?? 0);
        }
    }
    return [
        'id' => $id,
        'renderer' => (string) ($snapshot['renderer'] ?? ''),
        'workspaceKey' => (string) ($snapshot['workspaceKey'] ?? ''),
        'requestUrl' => (string) ($snapshot['requestUrl'] ?? ''),
        'requestPath' => (string) ($snapshot['requestPath'] ?? ''),
        'programmerId' => (string) ($snapshot['programmerId'] ?? ''),
        'environmentKey' => (string) ($snapshot['adobePassEnvironmentKey'] ?? ''),
        'rowCount' => $rowCount,
        'createdAt' => (int) ($record['createdAt'] ?? 0),
        'expiresAt' => (int) ($record['expiresAt'] ?? 0),
    ];
}

function underpar_ibeta_html_comment(array $data = []): string
{
    $encoded = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return sprintf('<!-- ups-debug %s -->', $encoded ?: '{}');
}

function underpar_ibeta_render_minimal_landing(): never
{
    header('Content-Type: text/html; charset=utf-8');
    echo "<!doctype html><html><head><title>You're doing great.</title></head><body>Keep it UP!</body></html>";
    exit;
}

function underpar_ibeta_read_request_body(): string
{
    $body = file_get_contents('php://input');
    if (!is_string($body)) {
        return '';
    }
    if (strlen($body) > UNDERPAR_IBETA_MAX_BODY_BYTES) {
        return '';
    }
    return $body;
}

function underpar_ibeta_normalize_text(mixed $value): string
{
    return trim((string) ($value ?? ''));
}

function underpar_ibeta_normalize_single_snapshot(array $input): ?array
{
    $table = is_array($input['table'] ?? null) ? $input['table'] : null;
    if ($table === null) {
        return null;
    }

    $headers = [];
    foreach (($table['headers'] ?? []) as $value) {
        $text = underpar_ibeta_normalize_text($value);
        if ($text !== '') {
            $headers[] = $text;
        }
    }

    $rows = [];
    foreach (($table['rows'] ?? []) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $normalizedRow = [];
        foreach ($row as $value) {
            $normalizedRow[] = trim((string) ($value ?? ''));
        }
        if ($normalizedRow !== []) {
            $rows[] = $normalizedRow;
        }
    }

    if ($headers === [] || $rows === []) {
        return null;
    }

    $headerContext = is_array($input['headerContext'] ?? null) ? $input['headerContext'] : [];
    $pathSegments = [];
    foreach (($headerContext['pathSegments'] ?? []) as $segment) {
        $text = underpar_ibeta_normalize_text($segment);
        if ($text !== '') {
            $pathSegments[] = $text;
        }
    }

    $queryPairs = [];
    foreach (($headerContext['queryPairs'] ?? []) as $pair) {
        if (!is_array($pair)) {
            continue;
        }
        $key = underpar_ibeta_normalize_text($pair['key'] ?? '');
        if ($key === '') {
            continue;
        }
        $queryPairs[] = [
            'key' => $key,
            'operator' => underpar_ibeta_normalize_text($pair['operator'] ?? ''),
            'value' => underpar_ibeta_normalize_text($pair['value'] ?? ''),
        ];
    }

    return [
        'renderer' => underpar_ibeta_normalize_text($input['renderer'] ?? 'underpar-esm-teaser-v1') ?: 'underpar-esm-teaser-v1',
        'workspaceKey' => strtolower(underpar_ibeta_normalize_text($input['workspaceKey'] ?? 'esm') ?: 'esm'),
        'workspaceLabel' => underpar_ibeta_normalize_text($input['workspaceLabel'] ?? 'ESM') ?: 'ESM',
        'datasetLabel' => underpar_ibeta_normalize_text($input['datasetLabel'] ?? 'ESM Report Card') ?: 'ESM Report Card',
        'displayNodeLabel' => underpar_ibeta_normalize_text($input['displayNodeLabel'] ?? ''),
        'requestUrl' => underpar_ibeta_normalize_text($input['requestUrl'] ?? ''),
        'requestPath' => underpar_ibeta_normalize_text($input['requestPath'] ?? ''),
        'programmerId' => underpar_ibeta_normalize_text($input['programmerId'] ?? ''),
        'programmerName' => underpar_ibeta_normalize_text($input['programmerName'] ?? ''),
        'adobePassEnvironmentKey' => underpar_ibeta_normalize_text($input['adobePassEnvironmentKey'] ?? ''),
        'adobePassEnvironmentLabel' => underpar_ibeta_normalize_text($input['adobePassEnvironmentLabel'] ?? ''),
        'lastModified' => underpar_ibeta_normalize_text($input['lastModified'] ?? ''),
        'createdAt' => max(0, (int) ($input['createdAt'] ?? 0)),
        'headerContext' => [
            'pathSegments' => $pathSegments,
            'queryPairs' => $queryPairs,
        ],
        'table' => [
            'headers' => $headers,
            'rows' => $rows,
            'rowCount' => max(0, (int) ($table['rowCount'] ?? count($rows))),
        ],
    ];
}

function underpar_ibeta_normalize_snapshot(mixed $input): ?array
{
    if (!is_array($input)) {
        return null;
    }

    $cards = [];
    foreach (($input['cards'] ?? []) as $card) {
        if (!is_array($card)) {
            continue;
        }
        $normalizedCard = underpar_ibeta_normalize_single_snapshot($card);
        if ($normalizedCard !== null) {
            $cards[] = $normalizedCard;
        }
    }

    if ($cards !== []) {
        $primaryCard = $cards[0];
        return [
            'renderer' => underpar_ibeta_normalize_text($input['renderer'] ?? 'underpar-esm-teaser-v1') ?: 'underpar-esm-teaser-v1',
            'workspaceKey' => strtolower(
                underpar_ibeta_normalize_text($input['workspaceKey'] ?? ($primaryCard['workspaceKey'] ?? 'esm')) ?: 'esm'
            ),
            'workspaceLabel' => underpar_ibeta_normalize_text($input['workspaceLabel'] ?? ($primaryCard['workspaceLabel'] ?? 'ESM')) ?: 'ESM',
            'datasetLabel' => underpar_ibeta_normalize_text($input['datasetLabel'] ?? ($primaryCard['datasetLabel'] ?? 'ESM Report Card'))
                ?: 'ESM Report Card',
            'displayNodeLabel' => underpar_ibeta_normalize_text($input['displayNodeLabel'] ?? ''),
            'requestUrl' => underpar_ibeta_normalize_text($input['requestUrl'] ?? ($primaryCard['requestUrl'] ?? '')),
            'requestPath' => underpar_ibeta_normalize_text($input['requestPath'] ?? ($primaryCard['requestPath'] ?? '')),
            'programmerId' => underpar_ibeta_normalize_text($input['programmerId'] ?? ($primaryCard['programmerId'] ?? '')),
            'programmerName' => underpar_ibeta_normalize_text($input['programmerName'] ?? ($primaryCard['programmerName'] ?? '')),
            'adobePassEnvironmentKey' => underpar_ibeta_normalize_text(
                $input['adobePassEnvironmentKey'] ?? ($primaryCard['adobePassEnvironmentKey'] ?? '')
            ),
            'adobePassEnvironmentLabel' => underpar_ibeta_normalize_text(
                $input['adobePassEnvironmentLabel'] ?? ($primaryCard['adobePassEnvironmentLabel'] ?? '')
            ),
            'lastModified' => underpar_ibeta_normalize_text($input['lastModified'] ?? ''),
            'createdAt' => max(0, (int) ($input['createdAt'] ?? ($primaryCard['createdAt'] ?? 0))),
            'cards' => $cards,
            'cardCount' => count($cards),
        ];
    }

    return underpar_ibeta_normalize_single_snapshot($input);
}

function underpar_ibeta_generate_id(): string
{
    return bin2hex(random_bytes(18));
}

function underpar_ibeta_store_snapshot(array $snapshot, array $requestMeta = []): ?array
{
    $storageDir = underpar_ibeta_storage_dir();
    if (!is_dir($storageDir) && !mkdir($storageDir, 0775, true) && !is_dir($storageDir)) {
        return null;
    }

    $createdAt = time();
    $record = [
        'createdAt' => $createdAt,
        'expiresAt' => $createdAt + UNDERPAR_IBETA_RETENTION_SECONDS,
        'source' => underpar_ibeta_normalize_text($requestMeta['source'] ?? ''),
        'snapshot' => $snapshot,
        'debug' => is_array($requestMeta['debug'] ?? null) ? $requestMeta['debug'] : [],
    ];

    $id = underpar_ibeta_generate_id();
    $path = $storageDir . DIRECTORY_SEPARATOR . $id . '.json';
    $encoded = json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        return null;
    }
    if (file_put_contents($path, $encoded, LOCK_EX) === false) {
        return null;
    }

    return [
        'id' => $id,
        'viewUrl' => underpar_ibeta_public_base_url() . '?id=' . rawurlencode($id),
        'record' => $record,
    ];
}

function underpar_ibeta_load_record(string $id): ?array
{
    if ($id === '' || !preg_match('/^[a-f0-9]{36}$/', $id)) {
        return null;
    }

    $path = underpar_ibeta_storage_dir() . DIRECTORY_SEPARATOR . $id . '.json';
    if (!is_file($path)) {
        return null;
    }

    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded)) {
        return null;
    }

    $expiresAt = max(0, (int) ($decoded['expiresAt'] ?? 0));
    if ($expiresAt > 0 && $expiresAt < time()) {
      @unlink($path);
      return null;
    }

    $snapshot = underpar_ibeta_normalize_snapshot($decoded['snapshot'] ?? null);
    if ($snapshot === null) {
        return null;
    }

    return [
        'createdAt' => max(0, (int) ($decoded['createdAt'] ?? 0)),
        'expiresAt' => $expiresAt,
        'source' => underpar_ibeta_normalize_text($decoded['source'] ?? ''),
        'debug' => is_array($decoded['debug'] ?? null) ? $decoded['debug'] : [],
        'snapshot' => $snapshot,
    ];
}
