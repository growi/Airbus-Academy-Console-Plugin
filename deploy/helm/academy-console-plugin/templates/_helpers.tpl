{{/*
Object name. Fixed to pluginName rather than the usual release-prefixed fullname: the console
operator enables a plugin by name, and the e2e suite and portal launch URLs assume it.
*/}}
{{- define "academy.name" -}}
{{- .Values.pluginName -}}
{{- end -}}

{{- define "academy.labels" -}}
app.kubernetes.io/name: {{ include "academy.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/* The Deployment selector predates this chart; it must stay `app: <pluginName>`. */}}
{{- define "academy.selectorLabels" -}}
app: {{ include "academy.name" . }}
{{- end -}}

{{- define "academy.imageRepository" -}}
{{- if .Values.image.repository -}}
{{- .Values.image.repository -}}
{{- else -}}
{{- printf "image-registry.openshift-image-registry.svc:5000/%s/%s" .Release.Namespace (include "academy.name" .) -}}
{{- end -}}
{{- end -}}

{{- define "academy.image" -}}
{{- printf "%s:%s" (include "academy.imageRepository" .) .Values.image.tag -}}
{{- end -}}
