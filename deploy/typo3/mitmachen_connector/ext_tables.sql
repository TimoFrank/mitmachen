CREATE TABLE tx_mitmachenconnector_outbox (
    uid int(11) unsigned NOT NULL auto_increment,
    pid int(11) unsigned DEFAULT '0' NOT NULL,
    tstamp int(11) unsigned DEFAULT '0' NOT NULL,
    crdate int(11) unsigned DEFAULT '0' NOT NULL,

    submission_id varchar(36) DEFAULT '' NOT NULL,
    powermail_mail_uid int(11) unsigned DEFAULT '0' NOT NULL,
    source_form_uid int(11) unsigned DEFAULT '0' NOT NULL,
    submitted_at int(11) unsigned DEFAULT '0' NOT NULL,
    source_url varchar(2048) DEFAULT '' NOT NULL,
    form_version varchar(191) DEFAULT '' NOT NULL,
    privacy_notice_version varchar(191) DEFAULT '' NOT NULL,
    consent_text_version varchar(191) DEFAULT NULL,

    status varchar(16) DEFAULT 'pending' NOT NULL,
    attempt_count int(11) unsigned DEFAULT '0' NOT NULL,
    next_attempt_at int(11) unsigned DEFAULT '0' NOT NULL,
    locked_at int(11) unsigned DEFAULT '0' NOT NULL,
    lock_token varchar(36) DEFAULT '' NOT NULL,
    delivered_at int(11) unsigned DEFAULT '0' NOT NULL,
    last_http_status int(11) unsigned DEFAULT '0' NOT NULL,
    last_error_code varchar(64) DEFAULT '' NOT NULL,

    PRIMARY KEY (uid),
    UNIQUE KEY submission_id (submission_id),
    UNIQUE KEY powermail_mail_uid (powermail_mail_uid),
    KEY due_entries (status, next_attempt_at),
    KEY stale_locks (status, locked_at),
    KEY lock_token (lock_token)
);
