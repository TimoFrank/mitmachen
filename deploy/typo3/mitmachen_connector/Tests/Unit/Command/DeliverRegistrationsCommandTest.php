<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Command;

use Gematik\MitmachenConnector\Command\DeliverRegistrationsCommand;
use Gematik\MitmachenConnector\Configuration\ConnectorConfigurationProvider;
use Gematik\MitmachenConnector\Configuration\SecretProvider;
use Gematik\MitmachenConnector\Service\DeliveryService;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;

final class DeliverRegistrationsCommandTest extends TestCase
{
    public function testDisabledCommandDoesNotReadTransportConfigurationOrDeliver(): void
    {
        $configurationProvider = $this->createMock(ConnectorConfigurationProvider::class);
        $configurationProvider
            ->expects(self::once())
            ->method('isEnabled')
            ->willReturn(false);
        $configurationProvider
            ->expects(self::never())
            ->method('deliveryConfiguration');

        $secretProvider = $this->createMock(SecretProvider::class);
        $secretProvider
            ->expects(self::never())
            ->method('load');

        $deliveryService = $this->createMock(DeliveryService::class);
        $deliveryService
            ->expects(self::never())
            ->method('deliverDue');

        $commandTester = new CommandTester(
            new DeliverRegistrationsCommand(
                $configurationProvider,
                $secretProvider,
                $deliveryService,
            ),
        );

        self::assertSame(Command::SUCCESS, $commandTester->execute([]));
        self::assertSame(
            '{"status":"disabled","claimed":0}' . PHP_EOL,
            $commandTester->getDisplay(),
        );
    }
}
