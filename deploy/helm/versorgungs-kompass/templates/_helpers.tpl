{{- define "versorgungs-kompass.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "versorgungs-kompass.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "versorgungs-kompass.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "versorgungs-kompass.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "versorgungs-kompass.selectorLabels" -}}
app.kubernetes.io/name: {{ include "versorgungs-kompass.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end -}}

{{- define "versorgungs-kompass.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default "versorgungs-kompass-api" .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when serviceAccount.create is false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "versorgungs-kompass.gkeBackendConfigName" -}}
{{- default (printf "%s-api" (include "versorgungs-kompass.fullname" .)) .Values.gke.backendConfig.name -}}
{{- end -}}

{{- define "versorgungs-kompass.passwordResetBrokerFullname" -}}
{{- printf "%s-password-reset" (include "versorgungs-kompass.fullname" . | trunc 48 | trimSuffix "-") | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "versorgungs-kompass.passwordResetBrokerSelectorLabels" -}}
app.kubernetes.io/name: {{ include "versorgungs-kompass.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: password-reset-broker
{{- end -}}

{{- define "versorgungs-kompass.passwordResetBrokerServiceAccountName" -}}
{{- if .Values.passwordResetBroker.serviceAccount.create -}}
{{- default "versorgungs-kompass-password-reset" .Values.passwordResetBroker.serviceAccount.name -}}
{{- else -}}
{{- required "passwordResetBroker.serviceAccount.name is required when passwordResetBroker.serviceAccount.create is false" .Values.passwordResetBroker.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "versorgungs-kompass.passwordResetBrokerBackendConfigName" -}}
{{- default (include "versorgungs-kompass.passwordResetBrokerFullname" .) .Values.passwordResetBroker.backendConfig.name -}}
{{- end -}}

{{- define "versorgungs-kompass.typo3ConnectorFullname" -}}
{{- printf "%s-typo3-connector" (include "versorgungs-kompass.fullname" . | trunc 47 | trimSuffix "-") | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "versorgungs-kompass.typo3ConnectorBackendConfigName" -}}
{{- default (include "versorgungs-kompass.typo3ConnectorFullname" .) .Values.typo3Connector.backendConfig.name -}}
{{- end -}}
{{- define "versorgungs-kompass.gkeManagedCertificateName" -}}
{{- default (printf "%s-api" (include "versorgungs-kompass.fullname" .)) .Values.gke.managedCertificate.name -}}
{{- end -}}

{{- define "versorgungs-kompass.gkeSecretProviderClassName" -}}
{{- default (printf "%s-db" (include "versorgungs-kompass.fullname" .)) .Values.gke.secretSync.secretProviderClassName -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendFullname" -}}
{{- printf "%s-frontend" (include "versorgungs-kompass.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendSelectorLabels" -}}
app.kubernetes.io/name: {{ include "versorgungs-kompass.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end -}}

{{- define "versorgungs-kompass.frontendBackendConfigName" -}}
{{- default (include "versorgungs-kompass.frontendFullname" .) .Values.frontend.backendConfig.name -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendPublicFullname" -}}
{{- printf "%s-public" (include "versorgungs-kompass.frontendFullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendPublicSelectorLabels" -}}
app.kubernetes.io/name: {{ include "versorgungs-kompass.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend-public
{{- end -}}

{{- define "versorgungs-kompass.frontendPublicBackendConfigName" -}}
{{- default (include "versorgungs-kompass.frontendPublicFullname" .) .Values.frontend.publicEntry.backendConfig.name -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendPublicServiceAccountName" -}}
{{- if .Values.frontend.publicEntry.serviceAccount.create -}}
{{- default "versorgungs-kompass-frontend-public" .Values.frontend.publicEntry.serviceAccount.name -}}
{{- else -}}
{{- required "frontend.publicEntry.serviceAccount.name is required when frontend.publicEntry.serviceAccount.create is false" .Values.frontend.publicEntry.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendAuthProxyFullname" -}}
{{- printf "%s-auth-proxy" (include "versorgungs-kompass.frontendFullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendAuthProxySelectorLabels" -}}
app.kubernetes.io/name: {{ include "versorgungs-kompass.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend-auth-proxy
{{- end -}}

{{- define "versorgungs-kompass.frontendAuthProxyBackendConfigName" -}}
{{- default (include "versorgungs-kompass.frontendAuthProxyFullname" .) .Values.frontend.authProxy.backendConfig.name -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendAuthProxyServiceAccountName" -}}
{{- if .Values.frontend.authProxy.serviceAccount.create -}}
{{- default "versorgungs-kompass-frontend-auth-proxy" .Values.frontend.authProxy.serviceAccount.name -}}
{{- else -}}
{{- required "frontend.authProxy.serviceAccount.name is required when frontend.authProxy.serviceAccount.create is false" .Values.frontend.authProxy.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "versorgungs-kompass.frontendServiceAccountName" -}}
{{- if .Values.frontend.serviceAccount.create -}}
{{- default "versorgungs-kompass-frontend" .Values.frontend.serviceAccount.name -}}
{{- else -}}
{{- required "frontend.serviceAccount.name is required when frontend.serviceAccount.create is false" .Values.frontend.serviceAccount.name -}}
{{- end -}}
{{- end -}}
