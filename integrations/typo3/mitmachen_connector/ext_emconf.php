<?php

$EM_CONF[$_EXTKEY] = [
    'title' => '#Mitmachen Connector',
    'description' => 'Queues Powermail form 41 submissions in a reference-only outbox and delivers them to the Versorgungskompass API.',
    'category' => 'services',
    'author' => 'gematik GmbH',
    'author_email' => '',
    'state' => 'stable',
    'clearCacheOnLoad' => true,
    'version' => '1.0.0',
    'constraints' => [
        'depends' => [
            'php' => '8.2.0-8.4.99',
            'typo3' => '13.4.0-13.4.99',
            'extbase' => '13.4.0-13.4.99',
            'powermail' => '13.0.0-13.99.99',
        ],
        'conflicts' => [],
        'suggests' => [
            'scheduler' => '13.4.0-13.4.99',
        ],
    ],
];
