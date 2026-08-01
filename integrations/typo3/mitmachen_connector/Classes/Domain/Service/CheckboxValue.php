<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Service;

final class CheckboxValue
{
    public static function isSelected(mixed $value): bool
    {
        if (is_array($value)) {
            foreach ($value as $item) {
                if (self::isSelected($item)) {
                    return true;
                }
            }

            return false;
        }

        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value) || is_float($value)) {
            return $value !== 0 && $value !== 0.0;
        }

        if (!is_string($value)) {
            return false;
        }

        $normalized = strtolower(trim($value));

        return $normalized !== ''
            && !in_array(
                $normalized,
                ['0', 'false', 'no', 'off', 'nein', 'aus', 'nicht ausgewählt', 'nicht ausgewaehlt'],
                true,
            );
    }
}
