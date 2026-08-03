<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Configuration;

use Throwable;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

class ConnectorConfigurationProvider
{
    private const EXTENSION_KEY = 'mitmachen_connector';

    public function __construct(
        private readonly ExtensionConfiguration $extensionConfiguration,
    ) {
    }

    public function isEnabled(): bool
    {
        try {
            $values = $this->extensionConfiguration->get(self::EXTENSION_KEY);
        } catch (Throwable) {
            return false;
        }

        if (!is_array($values)) {
            return false;
        }

        return filter_var(
            $values['enabled'] ?? false,
            FILTER_VALIDATE_BOOL,
            FILTER_NULL_ON_FAILURE,
        ) === true;
    }

    public function enqueueConfiguration(): EnqueueConfiguration
    {
        $values = $this->values();

        return new EnqueueConfiguration(
            self::stringValue($values, 'sourceUrl'),
            self::stringValue($values, 'formVersion'),
            self::stringValue($values, 'privacyNoticeVersion'),
            self::stringValue($values, 'consentTextVersion'),
        );
    }

    public function deliveryConfiguration(): DeliveryConfiguration
    {
        $values = $this->values();

        return new DeliveryConfiguration(
            self::stringValue($values, 'endpoint'),
            self::stringValue($values, 'keyId'),
            self::stringValue($values, 'secretEnvVar', 'MITMACHEN_TYPO3_CONNECTOR_SECRET'),
            self::integerValue($values, 'batchSize', 25),
            self::integerValue($values, 'requestTimeoutSeconds', 10),
            self::integerValue($values, 'lockTimeoutSeconds', 900),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function values(): array
    {
        $values = $this->extensionConfiguration->get(self::EXTENSION_KEY);
        if (!is_array($values)) {
            throw new ConfigurationException('The mitmachen_connector extension configuration is unavailable.');
        }

        return $values;
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function stringValue(array $values, string $key, string $default = ''): string
    {
        $value = $values[$key] ?? $default;

        return is_scalar($value) ? trim((string)$value) : $default;
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function integerValue(array $values, string $key, int $default): int
    {
        $value = $values[$key] ?? $default;

        return filter_var($value, FILTER_VALIDATE_INT) !== false ? (int)$value : $default;
    }
}
