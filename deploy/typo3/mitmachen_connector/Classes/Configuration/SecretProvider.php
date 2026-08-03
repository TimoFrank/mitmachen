<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Configuration;

class SecretProvider
{
    public function load(DeliveryConfiguration $configuration): string
    {
        $encodedSecret = getenv($configuration->secretEnvVar);
        if ($encodedSecret === false || trim($encodedSecret) === '') {
            throw new ConfigurationException(
                'The configured connector secret environment variable is missing or empty.',
            );
        }

        $decodedSecret = base64_decode(trim($encodedSecret), true);
        if ($decodedSecret === false || strlen($decodedSecret) < 32) {
            throw new ConfigurationException(
                'The connector secret must be strict base64 encoding of at least 32 random bytes.',
            );
        }

        return $decodedSecret;
    }
}
