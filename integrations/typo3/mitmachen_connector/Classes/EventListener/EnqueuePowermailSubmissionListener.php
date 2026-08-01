<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\EventListener;

use Gematik\MitmachenConnector\Configuration\ConnectorConfigurationProvider;
use Gematik\MitmachenConnector\Domain\Model\RegistrationMetadata;
use Gematik\MitmachenConnector\Domain\Service\PowermailRegistrationMapper;
use Gematik\MitmachenConnector\Domain\Service\UuidGenerator;
use Gematik\MitmachenConnector\Infrastructure\OutboxRepositoryInterface;
use In2code\Powermail\Domain\Model\Answer;
use In2code\Powermail\Events\FormControllerCreateActionAfterMailDbSavedEvent;

final class EnqueuePowermailSubmissionListener
{
    public function __construct(
        private readonly ConnectorConfigurationProvider $configurationProvider,
        private readonly PowermailRegistrationMapper $mapper,
        private readonly OutboxRepositoryInterface $outboxRepository,
        private readonly UuidGenerator $uuidGenerator,
    ) {
    }

    public function __invoke(FormControllerCreateActionAfterMailDbSavedEvent $event): void
    {
        if (!$this->configurationProvider->isEnabled()) {
            return;
        }

        $mail = $event->getMail();
        $formUid = (int)($mail->getForm()?->getUid() ?? 0);
        $mailUid = (int)($mail->getUid() ?? 0);
        if ($formUid !== PowermailRegistrationMapper::SOURCE_FORM_UID || $mailUid <= 0) {
            return;
        }

        $answersByMarker = [];
        foreach ($mail->getAnswers() as $answer) {
            if (!$answer instanceof Answer || $answer->getField() === null) {
                continue;
            }
            $answersByMarker[$answer->getField()->getMarker()] = $answer->getValue();
        }

        $configuration = $this->configurationProvider->enqueueConfiguration();
        $submittedAt = $mail->getCrdate()?->getTimestamp() ?? time();
        $consentTextVersion = $this->mapper->freezeConsentTextVersion(
            $answersByMarker,
            $configuration->consentTextVersion,
        );

        $this->outboxRepository->enqueue(
            new RegistrationMetadata(
                $this->uuidGenerator->generateV4(),
                $submittedAt,
                PowermailRegistrationMapper::SOURCE_FORM_UID,
                $mailUid,
                $configuration->sourceUrl,
                $configuration->formVersion,
                $configuration->privacyNoticeVersion,
                $consentTextVersion,
            ),
            time(),
        );
    }
}
