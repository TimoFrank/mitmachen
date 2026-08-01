<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\EventListener;

use DateTime;
use Gematik\MitmachenConnector\Configuration\ConnectorConfigurationProvider;
use Gematik\MitmachenConnector\Configuration\EnqueueConfiguration;
use Gematik\MitmachenConnector\Domain\Model\RegistrationMetadata;
use Gematik\MitmachenConnector\Domain\Service\PowermailRegistrationMapper;
use Gematik\MitmachenConnector\Domain\Service\UuidGenerator;
use Gematik\MitmachenConnector\EventListener\EnqueuePowermailSubmissionListener;
use Gematik\MitmachenConnector\Infrastructure\OutboxRepositoryInterface;
use In2code\Powermail\Controller\FormController;
use In2code\Powermail\Domain\Model\Answer;
use In2code\Powermail\Domain\Model\Field;
use In2code\Powermail\Domain\Model\Form;
use In2code\Powermail\Domain\Model\Mail;
use In2code\Powermail\Events\FormControllerCreateActionAfterMailDbSavedEvent;
use PHPUnit\Framework\TestCase;

final class EnqueuePowermailSubmissionListenerTest extends TestCase
{
    public function testDisabledConnectorDoesNotInspectOrEnqueueSubmission(): void
    {
        $configuration = $this->createMock(ConnectorConfigurationProvider::class);
        $configuration->expects(self::once())->method('isEnabled')->willReturn(false);
        $configuration->expects(self::never())->method('enqueueConfiguration');

        $outbox = $this->createMock(OutboxRepositoryInterface::class);
        $outbox->expects(self::never())->method('enqueue');

        $listener = new EnqueuePowermailSubmissionListener(
            $configuration,
            new PowermailRegistrationMapper(),
            $outbox,
            new UuidGenerator(),
        );

        $listener($this->event(self::mail(41, 123)));
    }

    public function testSupportedSubmissionFreezesConsentAndEnqueuesMetadata(): void
    {
        $configuration = $this->createMock(ConnectorConfigurationProvider::class);
        $configuration->expects(self::once())->method('isEnabled')->willReturn(true);
        $configuration
            ->expects(self::once())
            ->method('enqueueConfiguration')
            ->willReturn(new EnqueueConfiguration(
                'https://www.gematik.de/mitmachen/versorgungs-netzwerk',
                'powermail-41-v7',
                'privacy-v4',
                'consent-v3',
            ));

        $outbox = $this->createMock(OutboxRepositoryInterface::class);
        $outbox
            ->expects(self::once())
            ->method('enqueue')
            ->with(
                self::callback(static function (RegistrationMetadata $metadata): bool {
                    self::assertMatchesRegularExpression(
                        '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D',
                        $metadata->submissionId,
                    );
                    self::assertSame(1_785_427_200, $metadata->submittedAt);
                    self::assertSame(41, $metadata->sourceFormUid);
                    self::assertSame(123, $metadata->sourceRecordUid);
                    self::assertSame('consent-v3', $metadata->consentTextVersion);

                    return true;
                }),
                self::isType('int'),
            )
            ->willReturn(true);

        $mail = self::mail(41, 123);
        $mail->setCrdate(new DateTime('@1785427200'));
        $mail->addAnswer(self::answer('ihree_mail_adresse_01', 'person@example.org'));
        $mail->addAnswer(self::answer(
            PowermailRegistrationMapper::CONSENT_MARKER,
            ['Ja, ich möchte Informationen erhalten.'],
            Answer::VALUE_TYPE_ARRAY,
        ));

        $listener = new EnqueuePowermailSubmissionListener(
            $configuration,
            new PowermailRegistrationMapper(),
            $outbox,
            new UuidGenerator(),
        );

        $listener($this->event($mail));
    }

    private function event(Mail $mail): FormControllerCreateActionAfterMailDbSavedEvent
    {
        return new FormControllerCreateActionAfterMailDbSavedEvent(
            $mail,
            $this->createStub(FormController::class),
        );
    }

    private static function mail(int $formUid, int $mailUid): Mail
    {
        $form = new Form();
        $form->_setProperty('uid', $formUid);

        $mail = new Mail();
        $mail->_setProperty('uid', $mailUid);
        $mail->setForm($form);

        return $mail;
    }

    private static function answer(string $marker, mixed $value, int $valueType = Answer::VALUE_TYPE_TEXT): Answer
    {
        $field = new Field();
        $field->setMarker($marker);

        $answer = new Answer();
        $answer->setField($field);
        $answer->setValueType($valueType);
        $answer->setValue($value);

        return $answer;
    }
}
