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

{{- define "versorgungs-kompass.frontendServiceAccountName" -}}
{{- if .Values.frontend.serviceAccount.create -}}
{{- default "versorgungs-kompass-frontend" .Values.frontend.serviceAccount.name -}}
{{- else -}}
{{- required "frontend.serviceAccount.name is required when frontend.serviceAccount.create is false" .Values.frontend.serviceAccount.name -}}
{{- end -}}
{{- end -}}
