import {
  PageHeader,
  SectionHeader,
  Card,
  CardContent,
  StatCard,
  StatGrid,
  Button,
  Badge,
  designTokens,
} from '@/lib/design-system';

export default function PageTemplate() {
  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="🎯"
          title="Page Title"
          subtitle="Brief description of what this page does"
          action={
            <Button variant="primary">
              Primary Action
            </Button>
          }
        />

        <div className={designTokens.spacing.section}>
          <StatGrid columns={3}>
            <StatCard
              label="Metric Name"
              value="1,234"
              icon="📊"
              trend={{ value: 12.5, isPositive: true }}
              description="Additional context"
            />
            <StatCard
              label="Another Metric"
              value="£5,678"
              icon="💰"
              trend={{ value: -3.2, isPositive: false }}
            />
            <StatCard
              label="Third Metric"
              value="89%"
              icon="✨"
            />
          </StatGrid>

          <Card>
            <CardContent>
              <SectionHeader
                title="Section Title"
                subtitle="Section description"
                action={
                  <Button variant="secondary">
                    Secondary Action
                  </Button>
                }
              />
              <div className="mt-6">
                <p className={designTokens.typography.body}>
                  Main content goes here. Tables, lists, forms, etc.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <h3 className={designTokens.typography.cardTitle}>
                  Another Section
                </h3>
                <Badge variant="success">Active</Badge>
              </div>
              <p className={designTokens.typography.body}>
                More content here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
