<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Command;

use Gematik\MitmachenConnector\Configuration\ConfigurationException;
use Gematik\MitmachenConnector\Configuration\ConnectorConfigurationProvider;
use Gematik\MitmachenConnector\Configuration\SecretProvider;
use Gematik\MitmachenConnector\Service\DeliveryService;
use JsonException;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

final class DeliverRegistrationsCommand extends Command
{
    public function __construct(
        private readonly ConnectorConfigurationProvider $configurationProvider,
        private readonly SecretProvider $secretProvider,
        private readonly DeliveryService $deliveryService,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption(
            'limit',
            null,
            InputOption::VALUE_REQUIRED,
            'Override the configured batch size for this run (1-100).',
        );
    }

    /**
     * @throws JsonException
     */
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if (!$this->configurationProvider->isEnabled()) {
            $output->writeln(
                json_encode(
                    ['status' => 'disabled', 'claimed' => 0],
                    JSON_THROW_ON_ERROR,
                ),
            );

            return Command::SUCCESS;
        }

        try {
            $configuration = $this->configurationProvider->deliveryConfiguration();
            $binarySecret = $this->secretProvider->load($configuration);
        } catch (ConfigurationException) {
            $output->writeln(
                json_encode(
                    ['status' => 'configuration_error', 'claimed' => 0],
                    JSON_THROW_ON_ERROR,
                ),
            );

            return Command::INVALID;
        }

        $limit = $configuration->batchSize;
        $limitOption = $input->getOption('limit');
        if ($limitOption !== null) {
            $validatedLimit = filter_var(
                $limitOption,
                FILTER_VALIDATE_INT,
                ['options' => ['min_range' => 1, 'max_range' => 100]],
            );
            if ($validatedLimit === false) {
                $output->writeln(
                    json_encode(
                        ['status' => 'invalid_limit', 'claimed' => 0],
                        JSON_THROW_ON_ERROR,
                    ),
                );

                return Command::INVALID;
            }
            $limit = (int)$validatedLimit;
        }

        $result = $this->deliveryService->deliverDue(
            $configuration,
            $binarySecret,
            $limit,
        );
        $output->writeln(
            json_encode(
                ['status' => 'ok'] + $result->toArray(),
                JSON_THROW_ON_ERROR,
            ),
        );

        return Command::SUCCESS;
    }
}
