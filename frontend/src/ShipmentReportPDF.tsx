import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, borderBottomWidth: 2, borderBottomColor: '#2563eb', paddingBottom: 12 },
  logo: { fontSize: 18, fontWeight: 'bold', color: '#2563eb', marginRight: 12 },
  title: { fontSize: 14, color: '#374151' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  body: { fontSize: 10, color: '#374151', lineHeight: 1.5 },
  txId: { fontFamily: 'Courier', fontSize: 9, backgroundColor: '#f3f4f6', padding: 8, marginTop: 6 },
  qrPlaceholder: { width: 80, height: 80, backgroundColor: '#e5e7eb', marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  verdict: { backgroundColor: '#eff6ff', padding: 12, borderLeftWidth: 4, borderLeftColor: '#16a34a', marginTop: 8 },
  image: { width: '100%', height: 140, marginTop: 8 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

interface ShipmentReportPDFProps {
  shipmentId: string;
  origin: string;
  destination: string;
  txId: string | null;
  confirmedRound: number | null;
  reasoningNarrative: string;
  graphDataUrl: string | null;
  appId: number;
  timestamp: string;
}

const LORA_BASE = 'https://lora.algokit.io/testnet';

export function ShipmentReportPDF({
  shipmentId,
  origin,
  destination,
  txId,
  confirmedRound,
  reasoningNarrative,
  graphDataUrl,
  appId,
  timestamp,
}: ShipmentReportPDFProps) {
  const explorerUrl = txId ? `${LORA_BASE}/transaction/${txId}` : `${LORA_BASE}/application/${appId}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logo}>Navi-Trust</Text>
          <Text style={styles.title}>Shipment Audit Report — {shipmentId}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipment Details</Text>
          <Text style={styles.body}>
            {origin} → {destination}
          </Text>
          <Text style={styles.body}>Generated: {timestamp}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blockchain Proof (Algorand)</Text>
          {txId ? (
            <>
              <Text style={styles.body}>Transaction ID (verified on-chain):</Text>
              <Text style={styles.txId}>{txId}</Text>
              {confirmedRound != null && (
                <Text style={styles.body}>Confirmed in Round: {confirmedRound}</Text>
              )}
              <Text style={styles.body}>View: {explorerUrl}</Text>
              <View style={styles.qrPlaceholder}>
                <Text style={styles.body}>QR</Text>
                <Text style={{ ...styles.body, fontSize: 8 }}>Scan for Lora</Text>
              </View>
            </>
          ) : (
            <Text style={styles.body}>No on-chain transaction recorded for this report.</Text>
          )}
        </View>

        {graphDataUrl && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Risk Analytics Graph</Text>
            <Image src={graphDataUrl} style={styles.image} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Verdict (Settlement Arbiter)</Text>
          <View style={styles.verdict}>
            <Text style={styles.body}>{reasoningNarrative}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Navi-Trust · AI + Blockchain Supply Chain Risk Monitor · Algorand Testnet · APP_ID {appId}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateShipmentReportPDF(props: ShipmentReportPDFProps): Promise<Blob> {
  const doc = <ShipmentReportPDF {...props} />;
  return pdf(doc).toBlob();
}
